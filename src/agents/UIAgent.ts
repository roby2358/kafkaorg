/**
 * UI Agent
 *
 * Thin proxy between WebSocket and Kafka.
 * Responsibilities:
 * - Accept WebSocket connections
 * - Forward user messages to conversational agent topic
 * - Stream agent responses back to browser
 */

import { WebSocket } from 'ws';
import { BaseAgent } from './BaseAgent.js';
import { ConversationMessage } from '../kafka/types.js';
import { Docmem } from '../docmem_tools/docmem.js';
import {
  createConversationDocmem,
  loadConversationDocmem,
  createMessageNode,
  fetchMessageNode,
} from '../docmem_tools/conversation_docmem.js';

export class UIAgent extends BaseAgent {
  private ws: WebSocket | null = null;
  private conversationalAgentTopic: string;
  private conversationDocmem: Docmem | null = null;

  constructor(
    id: string,
    conversationId: string,
    prototypeId: number,
    conversationalAgentTopic: string
  ) {
    super(id, conversationId, prototypeId);
    this.conversationalAgentTopic = conversationalAgentTopic;
  }

  /**
   * Start the UI agent
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log(`UI Agent ${this.id} already running`);
      return;
    }

    this.running = true;

    // Try to load existing conversation docmem, or create new one
    try {
      this.conversationDocmem = await loadConversationDocmem(this.conversationId);
      console.log(`UI Agent ${this.id}: Loaded existing conversation docmem`);
    } catch (error) {
      console.log(`UI Agent ${this.id}: Creating new conversation docmem`);
      this.conversationDocmem = await createConversationDocmem(this.conversationId);
    }

    // Subscribe to the conversational agent's topic (both agents use same topic)
    await this.subscribeToTopic(this.conversationalAgentTopic, true);

    console.log(`UI Agent ${this.id} started`);
  }

  /**
   * Attach a WebSocket connection
   */
  attachWebSocket(ws: WebSocket): void {
    this.ws = ws;

    // WebSocket protocol: plain text in/out
    ws.on('message', async (data: Buffer) => {
      try {
        const message = data.toString();  // Plain text message
        await this.handleUserMessage(message);
      } catch (error) {
        console.error(`UI Agent ${this.id}: Error processing WebSocket message:`, error);
        this.sendToWebSocket(`Error: Failed to process message`);
      }
    });

    ws.on('close', () => {
      console.log(`UI Agent ${this.id}: WebSocket closed`);
      this.ws = null;
    });

    ws.on('error', (error) => {
      console.error(`UI Agent ${this.id}: WebSocket error:`, error);
    });

    console.log(`UI Agent ${this.id}: WebSocket attached`);
  }

  /**
   * Handle user message from WebSocket (plain text)
   */
  private async handleUserMessage(content: string): Promise<void> {
    if (!this.conversationDocmem) {
      console.error(`UI Agent ${this.id}: Conversation docmem not initialized`);
      return;
    }

    // Create docmem node with context text:agent:{agentId}
    const node = await createMessageNode(this.conversationDocmem, this.id, content);

    // Determine if this is the first message (create) or continuation (append)
    const rootNode = await this.conversationDocmem._getRoot();
    const nodes = await this.conversationDocmem.serialize(rootNode.id);
    const action = nodes.length === 2 ? 'create' : 'append';  // Root + 1 message = create

    // Send Kafka record to conversational agent topic
    const message = this.createMessage(
      rootNode.id,
      node.id,
      action
    );

    await this.sendMessage(this.conversationalAgentTopic, message);

    console.log(`UI Agent ${this.id}: Sent user message to conversational agent`);
  }

  /**
   * Handle incoming message from Kafka (agent responses)
   */
  async handleMessage(
    message: ConversationMessage,
    _topic: string
  ): Promise<void> {
    if (!this.conversationDocmem) {
      console.error(`UI Agent ${this.id}: Conversation docmem not initialized`);
      return;
    }

    // Fetch the message content from docmem
    const node = await fetchMessageNode(this.conversationDocmem, message.node_id);
    if (!node) {
      console.error(`UI Agent ${this.id}: Node ${message.node_id} not found`);
      return;
    }

    // Send plain text to WebSocket
    this.sendToWebSocket(node.text);

    console.log(`UI Agent ${this.id}: Forwarded message to WebSocket`);
  }

  /**
   * Send plain text message to WebSocket
   */
  private sendToWebSocket(text: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(text);  // Plain text, not JSON
    }
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    await super.stop();
  }
}
