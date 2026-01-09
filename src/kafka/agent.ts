// In-process Kafka Agent for Kafkaorg

import { Consumer } from 'kafkajs';
import { createConsumer, getProducer } from './client.js';
import { ConversationMessage } from './types.js';
import { OpenRouterAPI, ChatMessage } from '../agents/OpenRouterAPI.js';

export class Agent {
  private agentId: number;
  private name: string;
  private topic: string;
  private consumer: Consumer | null = null;
  private running = false;
  private openRouter: OpenRouterAPI | null = null;
  private conversationHistory: ChatMessage[] = [];
  private lastMessageTime: Date | null = null;

  constructor(agentId: number, name: string, topic: string) {
    this.agentId = agentId;
    this.name = name;
    this.topic = topic;
    
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn(`Agent ${this.name}: OPENROUTER_API_KEY not set, agent will not be able to respond`);
    } else {
      this.openRouter = new OpenRouterAPI(apiKey, 'anthropic/claude-haiku-4.5');
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
      content: `You are a helpful AI assistant. You are part of a conversation system called Kafkaorg.`,
    }];

    const groupId = `agent-${this.agentId}`;
    this.consumer = createConsumer(groupId);
    
    await this.consumer.connect();
    // Subscribe from beginning to build conversation history cache
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: true });

    this.running = true;
    console.log(`Agent ${this.name} (id=${this.agentId}) started on topic ${this.topic}`);

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
        const response = await this.openRouter.chat(this.conversationHistory);
        await this.respond(parsed.conversation_id, response);
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

  async stop(): Promise<void> {
    if (!this.running || !this.consumer) {
      return;
    }

    this.running = false;
    await this.consumer.disconnect();
    this.consumer = null;
    console.log(`Agent ${this.name} stopped`);
  }

  isRunning(): boolean {
    return this.running;
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
