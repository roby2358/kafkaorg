// In-process Kafka Agent for Kafkaorg

import { Consumer } from 'kafkajs';
import { createConsumer, getProducer } from './client.js';
import { ConversationMessage } from './types.js';
import { OpenRouterAPI, ChatMessage } from '../agents/OpenRouterAPI.js';
import { CONVERSATION_PROMPT } from '../system_prompts/conversation.js';
import { BASH_ROOT_PROMPT } from '../system_prompts/bash_root.js';
import { SYSTEM_COMMANDS } from '../system_prompts/system_commands.js';
import { DOCMEM_COMMANDS } from '../system_prompts/docmem_commands.js';
import { processResponse, formatExecutionResults } from '../interpreter.js';

const SYSTEM_PROMPT = `${CONVERSATION_PROMPT}

${BASH_ROOT_PROMPT}

${SYSTEM_COMMANDS}

${DOCMEM_COMMANDS}`;

export class Agent {
  private agentId: number;
  private name: string;
  private topic: string;
  private model: string;
  private consumer: Consumer | null = null;
  private running = false;
  private startTime: Date | null = null;
  private openRouter: OpenRouterAPI | null = null;
  private conversationHistory: ChatMessage[] = [];
  private lastMessageTime: Date | null = null;
  private docmemId: string | null = null;

  constructor(agentId: number, name: string, topic: string, model: string) {
    this.agentId = agentId;
    this.name = name;
    this.topic = topic;
    this.model = model;
    
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn(`Agent ${this.name}: OPENROUTER_API_KEY not set, agent will not be able to respond`);
    } else {
      this.openRouter = new OpenRouterAPI(apiKey, this.model);
    }
  }

  async start(): Promise<void> {
    if (this.running) {
      console.log(`Agent ${this.name} already running`);
      return;
    }

    // Initialize conversation history with system message
    this.conversationHistory = [{
      role: 'system',
      content: SYSTEM_PROMPT,
    }];

    const groupId = `agent-${this.agentId}`;
    this.consumer = createConsumer(groupId);
    
    await this.consumer.connect();
    // Subscribe from beginning to build conversation history cache
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: true });

    this.running = true;
    this.startTime = new Date();
    console.log(`Agent ${this.name} (id=${this.agentId}) started on topic ${this.topic} at ${this.startTime.toISOString()}`);

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const rawMessage = message.value?.toString() || '';
        await this.handleMessage(rawMessage);
      },
    });
  }

  private async handleMessage(rawMessage: string): Promise<void> {
    let parsed: ConversationMessage;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      console.error(`Agent ${this.name}: Failed to parse message: ${rawMessage}`);
      return;
    }

    const messageTime = new Date(parsed.timestamp);
    
    // Skip messages that are older than the last message we processed (avoid skip back)
    if (this.lastMessageTime && messageTime < this.lastMessageTime) {
      return;
    }

    // Add message to conversation history cache
    if (parsed.user_id && !parsed.agent_id) {
      // User message
      this.conversationHistory.push({
        role: 'user',
        content: parsed.message,
      });
    } else if (parsed.agent_id && !parsed.user_id) {
      // Agent/assistant message
      this.conversationHistory.push({
        role: 'assistant',
        content: parsed.message,
      });
    }

    // Update last message time
    this.lastMessageTime = messageTime;

    // Only respond to user messages (has user_id, no agent_id)
    if (parsed.user_id && !parsed.agent_id) {
      console.log(`Agent ${this.name}: Received message from user ${parsed.user_id}: ${parsed.message}`);
      
      if (!this.openRouter) {
        console.error(`Agent ${this.name}: OpenRouter not initialized, cannot respond`);
        await this.respond(parsed.conversation_id, 'Error: OpenRouter API key not configured');
        return;
      }

      try {
        // Use cached conversation history (already includes the current user message)
        const llmResponse = await this.openRouter.chat(this.conversationHistory);
        
        // Process response: extract and execute commands from # Run blocks
        const { originalResponse, executionResults, docmemId: newDocmemId } = await processResponse(llmResponse, this.docmemId);
        
        // Update docmemId if a new one was created
        if (newDocmemId !== null) {
          this.docmemId = newDocmemId;
        }
        
        // Add the original LLM response to conversation history
        this.conversationHistory.push({
          role: 'assistant',
          content: originalResponse,
        });
        
        // Send the original LLM response as agent message
        await this.respond(parsed.conversation_id, originalResponse);
        
        // If there were command executions, send results as a user message
        // The agent will receive this from Kafka and respond to it (continuing the loop)
        if (executionResults.length > 0) {
          const resultsMessage = formatExecutionResults(executionResults);
          // Send results to Kafka as a user message (from system/framework)
          // History will be updated when we receive this message back from Kafka
          await this.sendUserMessage(parsed.conversation_id, resultsMessage);
        }
      } catch (error) {
        console.error(`Agent ${this.name}: Error processing message:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.respond(parsed.conversation_id, `Error: ${errorMessage}`);
      }
    }
  }

  private async respond(conversationId: number, message: string): Promise<void> {
    const producer = await getProducer();

    const response: ConversationMessage = {
      conversation_id: conversationId,
      user_id: null,
      agent_id: this.agentId,
      message: message,
      timestamp: new Date().toISOString(),
    };

    await producer.send({
      topic: this.topic,
      messages: [{ value: JSON.stringify(response) }],
    });

    console.log(`Agent ${this.name}: Sent response: ${message}`);
  }

  private async sendUserMessage(conversationId: number, message: string): Promise<void> {
    const producer = await getProducer();

    // Use a special user_id to indicate this is from the framework/interpreter
    const userMessage: ConversationMessage = {
      conversation_id: conversationId,
      user_id: 'system',
      agent_id: null,
      message: message,
      timestamp: new Date().toISOString(),
    };

    await producer.send({
      topic: this.topic,
      messages: [{ value: JSON.stringify(userMessage) }],
    });

    console.log(`Agent ${this.name}: Sent command results as user message`);
  }

  async stop(): Promise<void> {
    if (!this.running || !this.consumer) {
      return;
    }

    this.running = false;
    this.startTime = null;
    await this.consumer.disconnect();
    this.consumer = null;
    console.log(`Agent ${this.name} stopped`);
  }

  isRunning(): boolean {
    return this.running;
  }

  getStartTime(): Date | null {
    return this.startTime;
  }

}

// Registry of active agents
const activeAgents = new Map<number, Agent>();

export function getAgent(agentId: number): Agent | undefined {
  return activeAgents.get(agentId);
}

export function registerAgent(agent: Agent): void {
  activeAgents.set(agent['agentId'], agent);
}

export function unregisterAgent(agentId: number): void {
  activeAgents.delete(agentId);
}

export async function stopAllAgents(): Promise<void> {
  for (const agent of activeAgents.values()) {
    await agent.stop();
  }
  activeAgents.clear();
}

export function getAllAgents(): Map<number, Agent> {
  return activeAgents;
}

export function isAgentRunning(agentId: number): boolean {
  const agent = activeAgents.get(agentId);
  return agent ? agent.isRunning() : false;
}