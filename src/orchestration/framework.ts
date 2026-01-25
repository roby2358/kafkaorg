/**
 * Orchestration Framework
 *
 * Manages multi-agent conversations:
 * - Spawns agent instances (ui, conversational, docmem)
 * - Creates topics between agents
 * - Routes messages
 * - Intercepts and handles start-conversation commands
 */

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db/client.js';
import { getProducer, createTopic } from '../kafka/client.js';
import { ConversationMessage } from '../kafka/types.js';
import { BaseAgent } from '../agents/BaseAgent.js';
import { UIAgent } from '../agents/UIAgent.js';
import { ConversationalAgent } from '../agents/ConversationalAgent.js';
import type { WebSocket } from 'ws';

/**
 * Agent instance representation
 */
export interface AgentInstance {
  id: string;  // "ui-agent-abc123"
  prototypeId: number;
  conversationId: string;
  status: 'running' | 'stopped' | 'error';
}

/**
 * Topic representation
 */
export interface Topic {
  name: string;  // "ui-agent-x-conversational-agent-y"
  conversationId: string;
  participant1Id: string;
  participant2Id: string;
}

/**
 * Orchestration framework - manages agent lifecycle and routing
 */
export class OrchestrationFramework {
  private runningAgents: Map<string, BaseAgent> = new Map();
  /**
   * Create a new conversation with standard agent topology:
   * User ↔ UI Agent ↔ Conversational Agent
   */
  async createConversation(userId: string, description: string): Promise<string> {
    const conversationId = uuidv4();

    // Create conversation record
    await prisma.conversation.create({
      data: {
        id: conversationId,
        userId,
        description,
      },
    });

    // Get agent prototypes
    const uiPrototype = await prisma.agentPrototype.findUnique({
      where: { name: 'ui-agent' },
    });
    const conversationalPrototype = await prisma.agentPrototype.findUnique({
      where: { name: 'conversational-agent' },
    });

    if (!uiPrototype || !conversationalPrototype) {
      throw new Error('Required agent prototypes not found');
    }

    // Create agent instances
    const uiAgentId = `ui-agent-${uuidv4()}`;
    const conversationalAgentId = `conversational-agent-${uuidv4()}`;

    await prisma.agentInstance.createMany({
      data: [
        {
          id: uiAgentId,
          prototypeId: uiPrototype.id,
          conversationId,
          status: 'running',
        },
        {
          id: conversationalAgentId,
          prototypeId: conversationalPrototype.id,
          conversationId,
          status: 'running',
        },
      ],
    });

    // Create topic between UI and Conversational agents
    const topicName = `${uiAgentId}-${conversationalAgentId}`;

    // Create Kafka topic
    await createTopic(topicName);

    // Create topic record in database
    await prisma.topic.create({
      data: {
        name: topicName,
        conversationId,
        participant1Id: uiAgentId,
        participant2Id: conversationalAgentId,
      },
    });

    console.log(`Created conversation ${conversationId} with agents: ${uiAgentId}, ${conversationalAgentId}`);
    console.log(`Topic: ${topicName}`);

    return conversationId;
  }


  /**
   * Send a message to a topic
   */
  async sendMessage(
    topicName: string,
    message: ConversationMessage
  ): Promise<void> {
    const producer = await getProducer();
    await producer.send({
      topic: topicName,
      messages: [{ value: JSON.stringify(message) }],
    });
  }

  /**
   * Stop an agent instance
   */
  async stopAgent(agentId: string): Promise<void> {
    await prisma.agentInstance.update({
      where: { id: agentId },
      data: {
        status: 'stopped',
        stopped: new Date(),
      },
    });
    console.log(`Stopped agent: ${agentId}`);
  }

  /**
   * Stop all agents for a conversation
   */
  async stopConversation(conversationId: string): Promise<void> {
    const agents = await prisma.agentInstance.findMany({
      where: { conversationId, status: 'running' },
    });

    for (const agent of agents) {
      await this.stopAgent(agent.id);
    }

    console.log(`Stopped all agents for conversation: ${conversationId}`);
  }

  /**
   * Get all topics for a conversation
   */
  async getConversationTopics(conversationId: string): Promise<Topic[]> {
    const topics = await prisma.topic.findMany({
      where: { conversationId },
    });

    return topics.map(t => ({
      name: t.name,
      conversationId: t.conversationId,
      participant1Id: t.participant1Id,
      participant2Id: t.participant2Id,
    }));
  }

  /**
   * Get agent instances for a conversation
   */
  async getConversationAgents(conversationId: string): Promise<AgentInstance[]> {
    const agents = await prisma.agentInstance.findMany({
      where: { conversationId },
      include: { prototype: true },
    });

    return agents.map(a => ({
      id: a.id,
      prototypeId: a.prototypeId,
      conversationId: a.conversationId,
      status: a.status as 'running' | 'stopped' | 'error',
    }));
  }

  /**
   * Spawn and start agent instances for a conversation
   * This creates the actual agent objects and starts them
   */
  async spawnConversationAgents(conversationId: string): Promise<{
    uiAgent: UIAgent;
    conversationalAgent: ConversationalAgent;
  }> {
    // Get conversation and its agents from database
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        agents: {
          include: { prototype: true },
        },
        topics: true,
      },
    });

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Find UI and Conversational agents
    const uiAgentRecord = conversation.agents.find(a => a.prototype.name === 'ui-agent');
    const convAgentRecord = conversation.agents.find(a => a.prototype.name === 'conversational-agent');

    if (!uiAgentRecord || !convAgentRecord) {
      throw new Error('Missing required agents for conversation');
    }

    // Find topic connecting them
    const topic = conversation.topics.find(
      t =>
        (t.participant1Id === uiAgentRecord.id && t.participant2Id === convAgentRecord.id) ||
        (t.participant1Id === convAgentRecord.id && t.participant2Id === uiAgentRecord.id)
    );

    if (!topic) {
      throw new Error('Topic not found between UI and Conversational agents');
    }

    const topicName = topic.name;

    // Spawn UI Agent
    const uiAgent = new UIAgent(
      uiAgentRecord.id,
      conversationId,
      uiAgentRecord.prototypeId,
      topicName
    );

    // Spawn Conversational Agent
    const conversationalAgent = new ConversationalAgent(
      convAgentRecord.id,
      conversationId,
      convAgentRecord.prototypeId,
      topicName,
      convAgentRecord.prototype.systemPrompt,
      convAgentRecord.prototype.model
    );

    // Start agents
    await Promise.all([uiAgent.start(), conversationalAgent.start()]);

    // Register agents
    this.runningAgents.set(uiAgent.getId(), uiAgent);
    this.runningAgents.set(conversationalAgent.getId(), conversationalAgent);

    console.log(`Spawned agents for conversation ${conversationId}`);

    return { uiAgent, conversationalAgent };
  }


  /**
   * Get a running agent by ID
   */
  getRunningAgent(agentId: string): BaseAgent | undefined {
    return this.runningAgents.get(agentId);
  }

  /**
   * Stop and remove a running agent
   */
  async stopRunningAgent(agentId: string): Promise<void> {
    const agent = this.runningAgents.get(agentId);
    if (agent) {
      await agent.stop();
      this.runningAgents.delete(agentId);

      // Update database
      await this.stopAgent(agentId);
    }
  }

  /**
   * Stop all running agents for a conversation
   */
  async stopConversationAgents(conversationId: string): Promise<void> {
    const agentsToStop: BaseAgent[] = [];

    // Find all agents for this conversation
    for (const [agentId, agent] of this.runningAgents.entries()) {
      if (agent.getConversationId() === conversationId) {
        agentsToStop.push(agent);
      }
    }

    // Stop them
    for (const agent of agentsToStop) {
      await agent.stop();
      this.runningAgents.delete(agent.getId());
    }

    // Update database
    await this.stopConversation(conversationId);

    console.log(`Stopped all running agents for conversation ${conversationId}`);
  }

  /**
   * Attach WebSocket to UI agent
   */
  attachWebSocketToConversation(conversationId: string, ws: WebSocket): UIAgent | null {
    // Find UI agent for this conversation
    for (const agent of this.runningAgents.values()) {
      if (
        agent.getConversationId() === conversationId &&
        agent.getId().startsWith('ui-agent-')
      ) {
        (agent as UIAgent).attachWebSocket(ws);
        return agent as UIAgent;
      }
    }

    return null;
  }
}

// Singleton instance
export const orchestrationFramework = new OrchestrationFramework();
