import { Router, type IRouter, Request, Response } from 'express';
import { prisma } from '../../db/client.js';
import { validate } from '../../middleware/validation.js';
import { signUpRequestSchema } from '../../types/requests.js';

const router: IRouter = Router();

router.post(
  '/signup',
  validate(signUpRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { username, name } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      res.status(400).json({ detail: 'Username already exists' });
      return;
    }

    const newUser = await prisma.user.create({
      data: {
        username,
        name,
      },
    });

    res.json({
      user: {
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        created: newUser.created.toISOString(),
        updated: newUser.updated.toISOString(),
      },
    });
  }
);

export default router;
