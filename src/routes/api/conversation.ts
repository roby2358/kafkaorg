import { Router, type IRouter, Request, Response } from 'express';
import { prisma } from '../../db/client.js';
import { orchestrationFramework } from '../../orchestration/framework.js';

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

    try {
      // Create conversation with multi-agent architecture
      const description = `Conversation started ${new Date().toISOString()}`;
      const conversationId = await orchestrationFramework.createConversation(
        user_id,
        description
      );

      // Spawn and start the agents
      const { uiAgent, conversationalAgent } = await orchestrationFramework.spawnConversationAgents(
        conversationId
      );

      // Get the topic connecting UI and Conversational agents
      const topics = await orchestrationFramework.getConversationTopics(conversationId);
      const mainTopic = topics[0];

      res.json({
        conversation: {
          id: conversationId,
          description,
          topic: mainTopic?.name || '',
          user_id,
          ui_agent_id: uiAgent.getId(),
          conversational_agent_id: conversationalAgent.getId(),
          created: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Failed to create conversation:', error);
      res.status(500).json({
        error: 'Failed to create conversation',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// Get conversation by ID
router.get(
  '/conversation/:id',
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        user: true,
        agents: {
          include: { prototype: true },
        },
        topics: true,
      },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const uiAgent = conversation.agents.find(a => a.prototype.name === 'ui-agent');
    const convAgent = conversation.agents.find(a => a.prototype.name === 'conversational-agent');

    res.json({
      conversation: {
        id: conversation.id,
        description: conversation.description,
        topics: conversation.topics.map(t => t.name),
        user_id: conversation.userId,
        ui_agent_id: uiAgent?.id,
        conversational_agent_id: convAgent?.id,
        agents: conversation.agents.map(a => ({
          id: a.id,
          type: a.prototype.name,
          status: a.status,
        })),
        created: conversation.created.toISOString(),
        updated: conversation.updated.toISOString(),
      },
    });
  }
);

export default router;
