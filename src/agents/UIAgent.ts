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

export class UIAgent extends BaseAgent {
  private ws: WebSocket | null = null;
  private conversationalAgentTopic: string | null = null;

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

    // Subscribe to the topic connecting UI ↔ Conversational agent
    if (this.conversationalAgentTopic) {
      await this.subscribeToTopic(this.conversationalAgentTopic, false);
    }

    console.log(`UI Agent ${this.id} started`);
  }

  /**
   * Attach a WebSocket connection
   */
  attachWebSocket(ws: WebSocket): void {
    this.ws = ws;

    ws.on('message', async (data: Buffer) => {
      try {
        const payload = JSON.parse(data.toString());

        if (payload.type === 'user_message' && payload.message) {
          await this.handleUserMessage(payload.message, payload.user_id);
        }
      } catch (error) {
        console.error(`UI Agent ${this.id}: Error processing WebSocket message:`, error);
        this.sendToWebSocket({
          type: 'error',
          message: 'Failed to process message',
        });
      }
    });

    ws.on('close', () => {
      console.log(`UI Agent ${this.id}: WebSocket closed`);
      this.ws = null;
    });

    ws.on('error', (error) => {
      console.error(`UI Agent ${this.id}: WebSocket error:`, error);
    });

    // Send connection acknowledgment
    this.sendToWebSocket({
      type: 'connected',
      conversation_id: this.conversationId,
      agent_id: this.id,
    });

    console.log(`UI Agent ${this.id}: WebSocket attached`);
  }

  /**
   * Handle user message from WebSocket
   */
  private async handleUserMessage(message: string, userId: string): Promise<void> {
    if (!this.conversationalAgentTopic) {
      throw new Error('Conversational agent topic not set');
    }

    // Create message for conversational agent
    const msg = this.createMessage(message, {
      userId,
      agentId: null,
    });

    // Send to conversational agent topic
    await this.sendMessage(this.conversationalAgentTopic, msg);

    console.log(`UI Agent ${this.id}: Forwarded user message to conversational agent`);
  }

  /**
   * Handle incoming message from Kafka (agent responses)
   */
  async handleMessage(
    message: ConversationMessage,
    topic: string
  ): Promise<void> {
    // Only forward agent messages (not user messages)
    if (message.agent_id && !message.user_id) {
      this.sendToWebSocket({
        type: 'agent_message',
        message: message.message,
        agent_id: message.agent_id,
        timestamp: message.timestamp,
      });

      console.log(`UI Agent ${this.id}: Forwarded agent message to WebSocket`);
    }
  }

  /**
   * Send message to WebSocket
   */
  private sendToWebSocket(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
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
