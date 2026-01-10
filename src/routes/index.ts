import { Router, type IRouter, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import signinRouter from './api/signin.js';
import signupRouter from './api/signup.js';
import userMessageRouter from './api/user-message.js';
import conversationRouter from './api/conversation.js';
import agentsRouter from './api/agents.js';
import { generateOpenApiDocument } from '../openapi.js';

const router: IRouter = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const staticDir = path.join(__dirname, '../../static');

function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }
  
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split('=');
    if (cookieName === name) {
      return decodeURIComponent(cookieValue);
    }
  }
  return null;
}

// Swagger UI
const openApiDocument = generateOpenApiDocument();
router.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

router.get('/', (req: Request, res: Response) => {
  const userId = getCookie(req, 'kafkaorg');
  
  if (!userId) {
    res.redirect('/welcome.html');
    return;
  }
  
  res.sendFile(path.join(staticDir, 'index.html'));
});

router.get('/index.html', (req: Request, res: Response) => {
  const userId = getCookie(req, 'kafkaorg');
  
  if (!userId) {
    res.redirect('/welcome.html');
    return;
  }
  
  res.sendFile(path.join(staticDir, 'index.html'));
});

router.get('/signup', (_req, res) => {
  res.sendFile(path.join(staticDir, 'signup.html'));
});

router.get('/welcome.html', (_req, res) => {
  res.sendFile(path.join(staticDir, 'welcome.html'));
});

router.get('/conversation', (_req, res) => {
  res.sendFile(path.join(staticDir, 'conversation.html'));
});

router.get('/monitor.html', (_req, res) => {
  res.sendFile(path.join(staticDir, 'monitor.html'));
});

router.get('/docmem.html', (_req, res) => {
  res.sendFile(path.join(staticDir, 'docmem.html'));
});

router.use('/api', signinRouter);
router.use('/api', signupRouter);
router.use('/api', userMessageRouter);
router.use('/api', conversationRouter);
router.use('/api', agentsRouter);

export default router;
