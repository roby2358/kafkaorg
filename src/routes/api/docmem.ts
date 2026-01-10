import { Router, type IRouter, Request, Response } from 'express';
import { Docmem } from '../../docmem/docmem.js';

const router: IRouter = Router();

router.get(
  '/docmem/roots',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const roots = await Docmem.getAllRoots();
      const rootsData = roots.map(root => ({
        id: root.id,
        description: root.text || `${root.contextType}:${root.contextName}:${root.contextValue}`,
      }));
      res.json({ roots: rootsData });
    } catch (error) {
      console.error('Error fetching docmem roots:', error);
      res.status(500).json({ error: 'Failed to fetch docmem roots' });
    }
  }
);

router.get(
  '/docmem/:nodeId/structure',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { nodeId } = req.params;
      const docmem = new Docmem(nodeId);
      await docmem.ready();
      const structure = await docmem.structure(nodeId);
      res.json({ structure });
    } catch (error) {
      console.error('Error fetching docmem structure:', error);
      res.status(500).json({ error: 'Failed to fetch docmem structure' });
    }
  }
);

router.get(
  '/docmem/:nodeId/expand',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { nodeId } = req.params;
      const maxTokens = parseInt(req.query.length as string || '3000', 10);
      if (isNaN(maxTokens) || maxTokens <= 0) {
        res.status(400).json({ error: 'Invalid length parameter' });
        return;
      }
      const docmem = new Docmem(nodeId);
      await docmem.ready();
      const nodes = await docmem.expandToLength(nodeId, maxTokens);
      const nodesData = nodes.map(node => node.toDict());
      res.json({ nodes: nodesData });
    } catch (error) {
      console.error('Error expanding docmem:', error);
      res.status(500).json({ error: 'Failed to expand docmem' });
    }
  }
);

router.get(
  '/docmem/:nodeId/serialize',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { nodeId } = req.params;
      const docmem = new Docmem(nodeId);
      await docmem.ready();
      const nodes = await docmem.serialize(nodeId);
      const nodesData = nodes.map(node => node.toDict());
      const content = nodes.map(n => n.text).join('\n\n');
      res.json({ nodes: nodesData, content });
    } catch (error) {
      console.error('Error serializing docmem:', error);
      res.status(500).json({ error: 'Failed to serialize docmem' });
    }
  }
);

export default router;
