import { Router, type IRouter, Request, Response } from 'express';
import { prisma } from '../../db/client.js';
import { isAgentRunning, getAgent } from '../../kafka/index.js';

const router: IRouter = Router();

// Get all agents with their running status
router.get(
  '/agents',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const agents = await prisma.agent.findMany({
        where: {
          deleted: null,
        },
        orderBy: {
          id: 'desc',
        },
      });

      const agentsWithStatus = agents.map((agent) => {
        const agentInstance = getAgent(agent.id);
        const startTime = agentInstance?.getStartTime();
        
        return {
          id: agent.id,
          name: agent.name,
          topic: agent.topic,
          model: agent.model,
          active: agent.active,
          running: isAgentRunning(agent.id),
          startTime: startTime ? startTime.toISOString() : null,
          created: agent.created.toISOString(),
          updated: agent.updated.toISOString(),
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
