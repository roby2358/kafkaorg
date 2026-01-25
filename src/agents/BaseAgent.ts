/**
 * Base Agent Class
 *
 * Abstract base class for all agent types.
 * Provides common functionality:
 * - Kafka consumer management
 * - Message sending/receiving
 * - Lifecycle management (start/stop)
 */

import { Consumer } from 'kafkajs';
import { createConsumer, getProducer } from '../kafka/client.js';
import { ConversationMessage } from '../kafka/types.js';

export abstract class BaseAgent {
  protected id: string;
  protected conversationId: string;
  protected prototypeId: number;
  protected topics: Map<string, Consumer> = new Map();
  protected running: boolean = false;

  constructor(id: string, conversationId: string, prototypeId: number) {
    this.id = id;
    this.conversationId = conversationId;
    this.prototypeId = prototypeId;
  }

  /**
   * Start the agent - must be implemented by subclasses
   */
  abstract start(): Promise<void>;

  /**
   * Handle incoming message - must be implemented by subclasses
   */
  abstract handleMessage(
    message: ConversationMessage,
    topic: string
  ): Promise<void>;

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Disconnect all consumers
    for (const [topic, consumer] of this.topics.entries()) {
      try {
        await consumer.disconnect();
        console.log(`Agent ${this.id}: Disconnected from topic ${topic}`);
      } catch (error) {
        console.error(
          `Agent ${this.id}: Error disconnecting from ${topic}:`,
          error
        );
      }
    }

    this.topics.clear();
    console.log(`Agent ${this.id} stopped`);
  }

  /**
   * Subscribe to a topic and start consuming messages
   */
  protected async subscribeToTopic(
    topicName: string,
    fromBeginning: boolean = true
  ): Promise<void> {
    const groupId = `agent-${this.id}`;
    const consumer = createConsumer(groupId);

    await consumer.connect();
    await consumer.subscribe({ topic: topicName, fromBeginning });

    this.topics.set(topicName, consumer);

    await consumer.run({
      eachMessage: async ({ topic, message: kafkaMessage }) => {
        const rawMessage = kafkaMessage.value?.toString();
        if (!rawMessage) return;

        try {
          const parsed: ConversationMessage = JSON.parse(rawMessage);

          // Filter by conversation_id (conversation multiplexing)
          if (parsed.conversation_id !== this.conversationId) {
            return;
          }

          // Filter by agent_id (ignore own messages)
          if (parsed.agent_id === this.id) {
            return;
          }

          await this.handleMessage(parsed, topic);
        } catch (error) {
          console.error(
            `Agent ${this.id}: Failed to parse message from ${topic}:`,
            error
          );
        }
      },
    });

    console.log(`Agent ${this.id}: Subscribed to topic ${topicName}`);
  }

  /**
   * Send a message to a topic
   */
  protected async sendMessage(
    topicName: string,
    message: ConversationMessage
  ): Promise<void> {
    const producer = await getProducer();
    await producer.send({
      topic: topicName,
      messages: [{
        key: message.conversation_id,  // Partition key for consistent routing
        value: JSON.stringify(message)
      }],
    });

    console.log(`Agent ${this.id}: Sent message to ${topicName}`);
  }

  /**
   * Create a standard message object
   */
  protected createMessage(
    docmemNodeId: string,
    nodeId: string,
    action: string,
    options?: {
      command?: string[];
      correlationId?: string;
    }
  ): ConversationMessage {
    return {
      version: '1.0.0',
      conversation_id: this.conversationId,
      agent_id: this.id,
      timestamp: new Date().toISOString(),
      docmem_node_id: docmemNodeId,
      node_id: nodeId,
      action,
      command: options?.command,
      correlation_id: options?.correlationId,
    };
  }

  /**
   * Getters
   */
  getId(): string {
    return this.id;
  }

  getConversationId(): string {
    return this.conversationId;
  }

  isRunning(): boolean {
    return this.running;
  }
}
