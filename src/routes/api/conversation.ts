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

    // Create conversation with timestamp description
    const description = `Conversation started ${new Date().toISOString()}`;
    const conversation = await prisma.conversation.create({
      data: {
        description,
        topic: '', // temporary, will update after we have the ID
        userId: user_id,
      },
    });

    // Generate topic name
    const topic = `conv-${conversation.id}`;

    // Update conversation with topic
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { topic },
    });

    // Create Kafka topic
    await createTopic(topic);

    // Create agent for this conversation
    const agent = await prisma.agent.create({
      data: {
        name: `Agent for conversation ${conversation.id}`,
        topic,
        active: true,
      },
    });

    // Link agent to conversation
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { agentId: agent.id },
    });

    // Start the agent
    const agentInstance = new Agent(agent.id, agent.name, topic);
    registerAgent(agentInstance);
    await agentInstance.start();

    res.json({
      conversation: {
        id: conversation.id,
        description,
        topic,
        user_id,
        agent_id: agent.id,
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

    res.json({
      conversation: {
        id: conversation.id,
        description: conversation.description,
        topic: conversation.topic,
        user_id: conversation.userId,
        agent_id: conversation.agentId,
        created: conversation.created.toISOString(),
        updated: conversation.updated.toISOString(),
      },
    });
  }
);

export default router;
