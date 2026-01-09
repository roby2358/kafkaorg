// In-process Kafka Agent for Kafkaorg

import { Consumer } from 'kafkajs';
import { createConsumer, getProducer } from './client.js';
import { ConversationMessage } from './types.js';

export class Agent {
  private agentId: number;
  private name: string;
  private topic: string;
  private consumer: Consumer | null = null;
  private running = false;

  constructor(agentId: number, name: string, topic: string) {
    this.agentId = agentId;
    this.name = name;
    this.topic = topic;
  }

  async start(): Promise<void> {
    if (this.running) {
      console.log(`Agent ${this.name} already running`);
      return;
    }

    const groupId = `agent-${this.agentId}`;
    this.consumer = createConsumer(groupId);
    
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });

    this.running = true;
    console.log(`Agent ${this.name} (id=${this.agentId}) started on topic ${this.topic}`);

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        await this.handleMessage(message.value?.toString() || '');
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

    // Only respond to user messages (has user_id, no agent_id)
    if (parsed.user_id && !parsed.agent_id) {
      console.log(`Agent ${this.name}: Received message from user ${parsed.user_id}: ${parsed.message}`);
      await this.respond(parsed.conversation_id, 'OK');
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
