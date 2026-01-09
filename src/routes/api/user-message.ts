import { Router, type IRouter, Request, Response } from 'express';
import { prisma } from '../../db/client.js';
import { getProducer, ConversationMessage } from '../../kafka/index.js';

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

    // Look up conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversation_id },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Produce message to Kafka
    const producer = await getProducer();
    const kafkaMessage: ConversationMessage = {
      conversation_id,
      user_id,
      agent_id: null,
      message,
      timestamp: new Date().toISOString(),
    };

    await producer.send({
      topic: conversation.topic,
      messages: [{ value: JSON.stringify(kafkaMessage) }],
    });

    res.json({ sent: true });
  }
);

export default router;
