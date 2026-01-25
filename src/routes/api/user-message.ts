import { Router, type IRouter, Request, Response } from 'express';
import { prisma } from '../../db/client.js';
import { orchestrationFramework } from '../../orchestration/framework.js';

const router: IRouter = Router();

router.post(
  '/user-message',
  async (req: Request, res: Response): Promise<void> => {
    const { conversation_id, user_id, message } = req.body;

    if (!conversation_id) {
      res.status(400).json({ error: 'conversation_id is required' });
      return;
    }
    if (!user_id) {
      res.status(400).json({ error: 'user_id is required' });
      return;
    }
    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    try {
      // Look up conversation and get the main topic (ui-agent <-> conversational-agent)
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversation_id },
        include: {
          topics: true,
          agents: {
            include: { prototype: true },
          },
        },
      });

      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      // Find the UI agent
      const uiAgent = conversation.agents.find(a => a.prototype.name === 'ui-agent');
      if (!uiAgent) {
        res.status(500).json({ error: 'UI agent not found for conversation' });
        return;
      }

      // Find the main topic (connecting UI and conversational agents)
      const mainTopic = conversation.topics.find(t =>
        t.participant1Id === uiAgent.id || t.participant2Id === uiAgent.id
      );

      if (!mainTopic) {
        res.status(500).json({ error: 'Main topic not found for conversation' });
        return;
      }

      // Send message to the topic
      const kafkaMessage = {
        conversation_id,
        user_id,
        agent_id: null,
        message,
        timestamp: new Date().toISOString(),
      };

      await orchestrationFramework.sendMessage(mainTopic.name, kafkaMessage);

      res.json({ sent: true, topic: mainTopic.name });
    } catch (error) {
      console.error('Failed to send user message:', error);
      res.status(500).json({
        error: 'Failed to send message',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
