import { Router, type IRouter, Request, Response } from 'express';
import { prisma } from '../../db/client.js';
import { createTopic, Agent, registerAgent } from '../../kafka/index.js';

const router: IRouter = Router();

// Create a new conversation
router.post(
  '/conversation',
  async (req: Request, res: Response): Promise<void> => {
    const { user_id } = req.body;

    if (!user_id) {
      res.status(400).json({ error: 'user_id is required' });
      return;
    }

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: user_id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Create agent first with temporary topic (will update with agent ID)
    const agent = await prisma.agent.create({
      data: {
        name: `Agent ${Date.now()}`,
        topic: `agent-${Date.now()}`, // temporary, will update after we have the ID
        model: 'anthropic/claude-haiku-4.5',
        active: true,
      },
    });

    // Update agent topic to use agent ID (agent-topic pair)
    const topic = `agent-${agent.id}`;
    const updatedAgent = await prisma.agent.update({
      where: { id: agent.id },
      data: { 
        topic,
        name: `conversation-agent-${agent.id}`,
      },
    });

    // Create Kafka topic (agent owns the topic)
    await createTopic(topic);

    // Start the agent (agent starts the topic)
    const agentInstance = new Agent(updatedAgent.id, updatedAgent.name, topic, updatedAgent.model);
    registerAgent(agentInstance);
    await agentInstance.start();

    // Create conversation linked to agent (conversation subscribes to agent's topic)
    const description = `Conversation started ${new Date().toISOString()}`;
    const conversation = await prisma.conversation.create({
      data: {
        description,
        userId: user_id,
        agentId: updatedAgent.id,
      },
    });

    res.json({
      conversation: {
        id: conversation.id,
        description,
        topic,
        user_id,
        agent_id: updatedAgent.id,
        created: conversation.created.toISOString(),
      },
    });
  }
);

// Get conversation by ID
router.get(
  '/conversation/:id',
  async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid conversation ID' });
      return;
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { user: true, agent: true },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    if (!conversation.agent) {
      res.status(500).json({ error: 'Conversation missing agent' });
      return;
    }

    res.json({
      conversation: {
        id: conversation.id,
        description: conversation.description,
        topic: conversation.agent.topic,
        user_id: conversation.userId,
        agent_id: conversation.agentId,
        created: conversation.created.toISOString(),
        updated: conversation.updated.toISOString(),
      },
    });
  }
);

export default router;
