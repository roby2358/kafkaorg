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
import { OpenRouterAPI, ChatMessage } from '../agents/OpenRouterAPI.js';
import { parse } from '../bash/index.js';
import { Docmem } from '../docmem_tools/docmem.js';
import { DocmemCommands } from '../docmem_tools/docmem_tools.js';
import { SystemCommands } from '../system_tools/system_tools.js';

export class ConversationalAgent extends BaseAgent {
  private uiAgentTopic: string | null = null;
  private openRouter: OpenRouterAPI | null = null;
  private userConversationHistory: ChatMessage[] = [];
  private systemPrompt: string;

  // Tool execution
  private docmemCommands: DocmemCommands | null = null;
  private systemCommands: SystemCommands = new SystemCommands();

  constructor(
    id: string,
    conversationId: string,
    prototypeId: number,
    uiAgentTopic: string,
    systemPrompt: string,
    model: string
  ) {
    super(id, conversationId, prototypeId);
    this.uiAgentTopic = uiAgentTopic;
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

    // Initialize conversation history with system prompt
    this.userConversationHistory = [
      {
        role: 'system',
        content: this.systemPrompt,
      },
    ];

    // Subscribe to UI agent topic
    if (this.uiAgentTopic) {
      await this.subscribeToTopic(this.uiAgentTopic, false);
    }

    console.log(`Conversational Agent ${this.id} started`);
  }

  /**
   * Handle incoming message
   */
  async handleMessage(
    message: ConversationMessage,
    _topic: string
  ): Promise<void> {
    // Handle user messages from UI agent
    if (message.user_id && !message.agent_id) {
      await this.handleUserMessage(message);
    }
  }

  /**
   * Handle user message from UI agent
   */
  private async handleUserMessage(message: ConversationMessage): Promise<void> {
    console.log(`Conversational Agent ${this.id}: Received user message: ${message.message}`);

    if (!this.openRouter) {
      await this.respondToUI('Error: OpenRouter API key not configured');
      return;
    }

    // Add user message to history
    this.userConversationHistory.push({
      role: 'user',
      content: message.message,
    });

    try {
      // Call LLM
      const llmResponse = await this.openRouter.chat(this.userConversationHistory);

      // Add LLM response to history
      this.userConversationHistory.push({
        role: 'assistant',
        content: llmResponse,
      });

      // Check for # Run blocks
      const runBlocks = this.extractRunBlocks(llmResponse);

      if (runBlocks.length > 0) {
        console.log(`Conversational Agent ${this.id}: Found ${runBlocks.length} # Run blocks`);

        // Process commands
        for (const commandStr of runBlocks) {
          await this.processCommand(commandStr);
        }

        // Send clean response (without # Run blocks) to UI
        const cleanResponse = this.removeRunBlocks(llmResponse);
        if (cleanResponse.trim()) {
          await this.respondToUI(cleanResponse);
        }
      } else {
        // No commands, send response directly to UI
        await this.respondToUI(llmResponse);
      }
    } catch (error) {
      console.error(`Conversational Agent ${this.id}: Error:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.respondToUI(`Error: ${errorMessage}`);
    }
  }

  /**
   * Process a command from # Run block
   */
  private async processCommand(commandStr: string): Promise<void> {
    try {
      const args = parse(commandStr);

      if (args.length === 0) {
        console.error(`Conversational Agent ${this.id}: Empty command`);
        return;
      }

      // Execute tool commands directly
      const result = await this.executeCommand(args);

      // Send result to UI
      if (result.result) {
        const formattedResult = `\`\`\`\n${result.result}\n\`\`\``;
        await this.respondToUI(formattedResult);
      }
    } catch (error) {
      console.error(`Conversational Agent ${this.id}: Command execution failed:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.respondToUI(`Error: ${errorMessage}`);
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
   * Send response to UI agent
   */
  private async respondToUI(message: string): Promise<void> {
    if (!this.uiAgentTopic) {
      console.error(`Conversational Agent ${this.id}: UI agent topic not set`);
      return;
    }

    const response = this.createMessage(message, {
      userId: null,
      agentId: this.id,
    });

    await this.sendMessage(this.uiAgentTopic, response);

    console.log(`Conversational Agent ${this.id}: Sent response to UI`);
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
