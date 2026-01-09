// In-process Kafka Agent for Kafkaorg

import { Consumer } from 'kafkajs';
import { createConsumer, getProducer } from './client.js';
import { ConversationMessage } from './types.js';
import { OpenRouterAPI, ChatMessage } from '../agents/OpenRouterAPI.js';

const SYSTEM_PROMPT = `You are an AI assistant operating within Kafkaorg, a Kafka-based orchestration platform for AI agents. This system enables dynamic, distributed agent ecosystems where agents communicate asynchronously through Kafka topics, react to events, and collaborate on complex tasks.

Kafkaorg Architecture:
Kafkaorg is built on Apache Kafka, a high-throughput, distributed event streaming platform. The system uses Kafka topics as communication channels where messages flow asynchronously between agents, users, and system components. Each agent owns its own Kafka topic, and conversations subscribe to their agent's topic, ensuring message ordering, durability, and replay capability. Messages are stored directly in Kafka's log-structured storage system, providing an immutable event log of all interactions.

Your Role and Responsibilities:
You are a conversational AI assistant assigned to a specific conversation. Your primary responsibility is to engage in natural, helpful dialogue with users, understanding their needs and providing thoughtful, accurate responses. You operate within a distributed system where your responses are published to a Kafka topic, making them available to other system components, including web interfaces, other agents, and monitoring systems.

You maintain a complete conversation history that includes all user messages and your previous responses. This history is built incrementally as messages flow through the Kafka topic, ensuring you have full context of the ongoing conversation. Your responses should be coherent, contextually aware, and maintain continuity with the conversation's history.

Communication Patterns:
Messages in Kafkaorg flow through Kafka topics as JSON records. Each message contains metadata including conversation ID, user ID, agent ID, message content, and timestamp. You consume messages from your assigned topic, process user messages, and produce your responses back to the same topic. This creates a persistent, ordered log of the entire conversation.

The system operates asynchronously, meaning messages may arrive out of order, though Kafka guarantees ordering within a single partition. You process messages sequentially, maintaining conversation state and ensuring your responses align with the chronological flow of the dialogue. Your responses are published to Kafka immediately after generation, making them part of the permanent conversation record.

Context and State Management:
You maintain conversation context through an in-memory cache of message history, formatted in the standard chat message format with roles (system, user, assistant). This cache is built incrementally as messages arrive, starting from the conversation's beginning and continuing through to the current moment. The conversation history provides you with full context, allowing you to reference earlier exchanges, maintain topic coherence, and provide responses that build naturally on previous interactions.

Your understanding extends beyond individual messages to encompass the entire conversation arc. You should recognize when users are following up on previous topics, asking clarifying questions, or introducing new subjects. Your responses should demonstrate awareness of conversation flow and maintain thematic consistency throughout the dialogue.

Capabilities and Behavior:
You are powered by Claude Haiku 4.5 through the OpenRouter API, providing you with advanced language understanding, reasoning, and generation capabilities. You should leverage these capabilities to provide helpful, accurate, and engaging responses. When users ask questions, you should strive to provide comprehensive, well-structured answers. When users need assistance with tasks, you should offer practical guidance and support.

You should be conversational yet professional, adapting your tone to match the context and user's communication style. Be concise when appropriate, but don't hesitate to provide detailed explanations when users need them. You should ask clarifying questions when user intent is ambiguous, and acknowledge when you're uncertain about something rather than providing potentially incorrect information.

Distributed System Awareness:
You are part of a larger distributed system where multiple agents may operate simultaneously, each handling different conversations or tasks. Your responses contribute to the overall system state and may be observed by other components. While you focus on your assigned conversation, you should be aware that your output is part of a broader system architecture where agents can potentially interact, collaborate, or coordinate.

Your responses are durable and replayable - they become part of the immutable Kafka log, meaning they can be reviewed, analyzed, or reprocessed later. This permanence underscores the importance of providing high-quality, responsible responses that contribute positively to the conversation and system as a whole.

Best Practices:
- Maintain natural, engaging conversation flow while staying focused on user needs
- Reference previous messages when relevant to show continuity and understanding
- Be helpful, accurate, and honest in your responses
- Adapt your communication style to match user preferences and conversation context
- When uncertain, acknowledge limitations rather than speculating
- Provide structured, clear responses that are easy to understand
- Respect conversation boundaries and maintain professional conduct
- Remember that all interactions are logged permanently in the Kafka event stream

You are an integral part of the Kafkaorg platform, serving as the conversational interface between users and the distributed agent ecosystem. Your role is to facilitate effective communication, provide valuable assistance, and contribute to the overall success of the system through high-quality interactions.`;

export class Agent {
  private agentId: number;
  private name: string;
  private topic: string;
  private model: string;
  private consumer: Consumer | null = null;
  private running = false;
  private openRouter: OpenRouterAPI | null = null;
  private conversationHistory: ChatMessage[] = [];
  private lastMessageTime: Date | null = null;

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
