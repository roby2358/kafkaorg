import { Router, type IRouter } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import signinRouter from './api/signin.js';
import signupRouter from './api/signup.js';

const router: IRouter = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const staticDir = path.join(__dirname, '../../static');

router.get('/', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

router.get('/signup', (_req, res) => {
  res.sendFile(path.join(staticDir, 'signup.html'));
});

router.use('/api', signinRouter);
router.use('/api', signupRouter);

export default router;
