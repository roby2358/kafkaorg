/**
 * Conversational Agent
 *
 * OpenRouter-powered orchestrator with integrated tool execution.
 * Responsibilities:
 * - Maintain conversation context with user
 * - Call OpenRouter API for responses
 * - Execute tool commands directly (docmem, system tools)
 * - Coordinate multi-agent workflows
 */

import { BaseAgent } from './BaseAgent.js';
import { ConversationMessage } from '../kafka/types.js';
import { OpenRouterAPI } from '../agents/OpenRouterAPI.js';
import { parse } from '../bash/index.js';
import { Docmem } from '../docmem_tools/docmem.js';
import { DocmemCommands } from '../docmem_tools/docmem_tools.js';
import { SystemCommands } from '../system_tools/system_tools.js';
import {
  createConversationDocmem,
  loadConversationDocmem,
  createMessageNode,
  fetchMessageNode,
  buildMessageList,
} from '../docmem_tools/conversation_docmem.js';

export class ConversationalAgent extends BaseAgent {
  private ownTopic: string;
  private openRouter: OpenRouterAPI | null = null;
  private systemPrompt: string;
  private conversationDocmem: Docmem | null = null;

  // Tool execution
  private docmemCommands: DocmemCommands | null = null;
  private systemCommands: SystemCommands = new SystemCommands();

  constructor(
    id: string,
    conversationId: string,
    prototypeId: number,
    ownTopic: string,
    systemPrompt: string,
    model: string
  ) {
    super(id, conversationId, prototypeId);
    this.ownTopic = ownTopic;
    this.systemPrompt = systemPrompt;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn(`Conversational Agent ${this.id}: OPENROUTER_API_KEY not set`);
    } else {
      this.openRouter = new OpenRouterAPI(apiKey, model);
    }
  }

  /**
   * Start the conversational agent
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log(`Conversational Agent ${this.id} already running`);
      return;
    }

    this.running = true;

    // Try to load existing conversation docmem, or create new one
    try {
      this.conversationDocmem = await loadConversationDocmem(this.conversationId);
      console.log(`Conversational Agent ${this.id}: Loaded existing conversation docmem`);
    } catch (error) {
      console.log(`Conversational Agent ${this.id}: Creating new conversation docmem`);
      this.conversationDocmem = await createConversationDocmem(this.conversationId);
    }

    // Subscribe to own topic (agent-owned topic with conversation multiplexing)
    await this.subscribeToTopic(this.ownTopic, true);

    console.log(`Conversational Agent ${this.id} started`);
  }

  /**
   * Handle incoming message
   */
  async handleMessage(
    message: ConversationMessage,
    _topic: string
  ): Promise<void> {
    // All messages that pass the filtering (not from me, matching conversation_id) are processed
    await this.handleIncomingMessage(message);
  }

  /**
   * Handle incoming message (from UI agent or tool results)
   */
  private async handleIncomingMessage(message: ConversationMessage): Promise<void> {
    if (!this.conversationDocmem) {
      console.error(`Conversational Agent ${this.id}: Conversation docmem not initialized`);
      return;
    }

    if (!this.openRouter) {
      await this.respond('Error: OpenRouter API key not configured');
      return;
    }

    // Fetch the message content from docmem
    const node = await fetchMessageNode(this.conversationDocmem, message.node_id);
    if (!node) {
      console.error(`Conversational Agent ${this.id}: Node ${message.node_id} not found`);
      return;
    }

    const content = node.text;
    console.log(`Conversational Agent ${this.id}: Received message: ${content.substring(0, 100)}...`);

    try {
      // Build message list using role-relative perspective
      const messages = await buildMessageList(
        this.conversationDocmem,
        this.id,
        this.systemPrompt
      );

      // Call LLM
      const llmResponse = await this.openRouter.chat(messages);

      // Check for # Run blocks
      const runBlocks = this.extractRunBlocks(llmResponse);

      if (runBlocks.length > 0) {
        console.log(`Conversational Agent ${this.id}: Found ${runBlocks.length} # Run blocks`);

        // Send clean response (without # Run blocks) first
        const cleanResponse = this.removeRunBlocks(llmResponse);
        if (cleanResponse.trim()) {
          await this.respond(cleanResponse);
        }

        // Process commands and send results
        for (const commandStr of runBlocks) {
          await this.processCommand(commandStr);
        }
      } else {
        // No commands, send response directly
        await this.respond(llmResponse);
      }
    } catch (error) {
      console.error(`Conversational Agent ${this.id}: Error:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.respond(`Error: ${errorMessage}`);
    }
  }

  /**
   * Process a command from # Run block
   */
  private async processCommand(commandStr: string): Promise<void> {
    if (!this.conversationDocmem) {
      console.error(`Conversational Agent ${this.id}: Conversation docmem not initialized`);
      return;
    }

    try {
      const args = parse(commandStr);

      if (args.length === 0) {
        console.error(`Conversational Agent ${this.id}: Empty command`);
        return;
      }

      // Execute tool commands directly
      const result = await this.executeCommand(args);

      // Send tool result as a message with agent_id="tool"
      if (result.result) {
        const formattedResult = `\`\`\`\n${result.result}\n\`\`\``;
        await this.sendToolResult(formattedResult);
      }
    } catch (error) {
      console.error(`Conversational Agent ${this.id}: Command execution failed:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.sendToolResult(`Error: ${errorMessage}`);
    }
  }

  /**
   * Execute a tool command directly
   */
  private async executeCommand(args: string[]): Promise<{ success: boolean; result: string }> {
    if (args.length === 0) {
      throw new Error('Empty command');
    }

    const command = args[0];

    console.log(`Conversational Agent ${this.id}: Executing command:`, command);

    // System commands
    if (command === 'hello-world') {
      return this.systemCommands.helloWorld();
    }

    // Docmem commands that don't require an active instance
    if (command === 'docmem-get-all-roots') {
      const roots = await Docmem.getAllRoots();
      return {
        success: true,
        result: `docmem-get-all-roots:\n${JSON.stringify(roots.map(r => r.toDict()), null, 2)}`,
      };
    }

    if (command === 'docmem-create') {
      if (args.length < 2) {
        throw new Error('docmem-create requires a root-id argument');
      }
      const validatedRootId = args[1].trim();
      const newDocmem = new Docmem(validatedRootId);
      await newDocmem.ready();

      // Store docmem instance for this conversation
      this.docmemCommands = new DocmemCommands(newDocmem);

      return { success: true, result: `docmem-create created docmem: ${validatedRootId}` };
    }

    // Docmem commands that require an active instance
    if (!this.docmemCommands) {
      throw new Error(`Command ${command} requires a docmem instance. Use docmem-create to create one first.`);
    }

    // Execute docmem instance commands
    switch (command) {
      case 'docmem-create-node':
        if (args.length < 7) {
          throw new Error('docmem-create-node requires mode, node-id, context-type, context-name, context-value, and content arguments');
        }
        return await this.docmemCommands.createNode(args[1], args[2], args[3], args[4], args[5], args[6]);

      case 'docmem-update-content':
        if (args.length < 3) {
          throw new Error('docmem-update-content requires node-id and content arguments');
        }
        return await this.docmemCommands.updateContent(args[1], args[2]);

      case 'docmem-update-context':
        if (args.length < 5) {
          throw new Error('docmem-update-context requires node-id, context-type, context-name, and context-value arguments');
        }
        return await this.docmemCommands.updateContext(args[1], args[2], args[3], args[4]);

      case 'docmem-move-node':
        if (args.length < 4) {
          throw new Error('docmem-move-node requires mode, node-id, and target-id arguments');
        }
        return await this.docmemCommands.moveNode(args[1], args[2], args[3]);

      case 'docmem-copy-node':
        if (args.length < 4) {
          throw new Error('docmem-copy-node requires mode, node-id, and target-id arguments');
        }
        return await this.docmemCommands.copyNode(args[1], args[2], args[3]);

      case 'docmem-delete':
        if (args.length < 2) {
          throw new Error('docmem-delete requires a node-id argument');
        }
        return await this.docmemCommands.delete(args[1]);

      case 'docmem-find':
        if (args.length < 2) {
          throw new Error('docmem-find requires a node-id argument');
        }
        return await this.docmemCommands.find(args[1]);

      case 'docmem-serialize':
        if (args.length < 2) {
          throw new Error('docmem-serialize requires a node-id argument');
        }
        return await this.docmemCommands.serialize(args[1]);

      case 'docmem-structure':
        if (args.length < 2) {
          throw new Error('docmem-structure requires a node-id argument');
        }
        return await this.docmemCommands.structure(args[1]);

      case 'docmem-expand-to-length':
        if (args.length < 3) {
          throw new Error('docmem-expand-to-length requires node-id and maxTokens arguments');
        }
        return await this.docmemCommands.expandToLength(args[1], args[2]);

      case 'docmem-add-summary':
        if (args.length < 7) {
          throw new Error('docmem-add-summary requires context-type, context-name, context-value, content, start-node-id, and end-node-id arguments');
        }
        return await this.docmemCommands.addSummary(args[1], args[2], args[3], args[4], args[5], args[6]);

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  /**
   * Send response to own topic (will be picked up by UI agent)
   */
  private async respond(content: string): Promise<void> {
    if (!this.conversationDocmem) {
      console.error(`Conversational Agent ${this.id}: Conversation docmem not initialized`);
      return;
    }

    // Create docmem node with context text:agent:{agentId}
    const node = await createMessageNode(this.conversationDocmem, this.id, content);

    // Send Kafka record to own topic
    const rootNode = await this.conversationDocmem._getRoot();
    const message = this.createMessage(
      rootNode.id,
      node.id,
      'append'
    );

    await this.sendMessage(this.ownTopic, message);

    console.log(`Conversational Agent ${this.id}: Sent response`);
  }

  /**
   * Send tool result to own topic with agent_id="tool"
   */
  private async sendToolResult(content: string): Promise<void> {
    if (!this.conversationDocmem) {
      console.error(`Conversational Agent ${this.id}: Conversation docmem not initialized`);
      return;
    }

    // Create docmem node with context text:agent:tool
    const node = await createMessageNode(this.conversationDocmem, 'tool', content);

    // Send Kafka record to own topic with agent_id="tool"
    const rootNode = await this.conversationDocmem._getRoot();
    const message = {
      version: '1.0.0',
      conversation_id: this.conversationId,
      agent_id: 'tool',  // Special agent_id for tool results
      timestamp: new Date().toISOString(),
      docmem_node_id: rootNode.id,
      node_id: node.id,
      action: 'tool_result',
    };

    await this.sendMessage(this.ownTopic, message);

    console.log(`Conversational Agent ${this.id}: Sent tool result`);
  }

  /**
   * Extract # Run blocks from LLM response
   */
  private extractRunBlocks(response: string): string[] {
    const commands: string[] = [];
    const runBlockRegex = /#\s*Run\s*\n```(?:bash)?\s*\n([\s\S]*?)```/g;
    let match;

    while ((match = runBlockRegex.exec(response)) !== null) {
      const command = match[1].trim();
      if (command) {
        commands.push(command);
      }
    }

    return commands;
  }

  /**
   * Remove # Run blocks from response
   */
  private removeRunBlocks(response: string): string {
    return response.replace(/#\s*Run\s*\n```(?:bash)?\s*\n[\s\S]*?```/g, '').trim();
  }
}
