import { Router, type IRouter, Request, Response } from 'express';
import { prisma } from '../../db/client.js';
import { validate } from '../../middleware/validation.js';
import { signInRequestSchema } from '../../types/requests.js';

const router: IRouter = Router();

router.post(
  '/signin',
  validate(signInRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { user_id } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: user_id },
    });

    if (!user) {
      res.json({ found: false });
      return;
    }

    res.json({
      found: true,
      user: {
        id: user.id,
        name: user.name,
        created: user.created.toISOString(),
        updated: user.updated.toISOString(),
      },
    });
  }
);

export default router;
