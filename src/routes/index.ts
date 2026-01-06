import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import signinRouter from './api/signin.js';
import signupRouter from './api/signup.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const staticDir = path.join(__dirname, '../../static');

router.get('/', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

router.get('/signup', (req, res) => {
  res.sendFile(path.join(staticDir, 'signup.html'));
});

router.use('/api', signinRouter);
router.use('/api', signupRouter);

export default router;
