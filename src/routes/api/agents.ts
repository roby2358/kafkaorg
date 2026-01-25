import { Router, type IRouter, Request, Response } from 'express';
import { prisma } from '../../db/client.js';
import { orchestrationFramework } from '../../orchestration/framework.js';

const router: IRouter = Router();

// Get all agent instances with their running status
router.get(
  '/agents',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const agentInstances = await prisma.agentInstance.findMany({
        include: {
          prototype: true,
          conversation: true,
        },
        orderBy: {
          created: 'desc',
        },
      });

      const agentsWithStatus = agentInstances.map((instance) => {
        const runningAgent = orchestrationFramework.getRunningAgent(instance.id);

        return {
          id: instance.id,
          type: instance.prototype.name,
          role: instance.prototype.role,
          model: instance.prototype.model,
          conversation_id: instance.conversationId,
          conversation_description: instance.conversation.description,
          status: instance.status,
          running: runningAgent?.isRunning() ?? false,
          created: instance.created.toISOString(),
          stopped: instance.stopped?.toISOString() ?? null,
        };
      });

      res.json({ agents: agentsWithStatus });
    } catch (error) {
      console.error('Error fetching agents:', error);
      res.status(500).json({ error: 'Failed to fetch agents' });
    }
  }
);

export default router;
