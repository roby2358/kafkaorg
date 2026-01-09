import { Router, type IRouter } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import signinRouter from './api/signin.js';
import signupRouter from './api/signup.js';
import userMessageRouter from './api/user-message.js';
import conversationRouter from './api/conversation.js';
import { generateOpenApiDocument } from '../openapi.js';

const router: IRouter = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const staticDir = path.join(__dirname, '../../static');

// Swagger UI
const openApiDocument = generateOpenApiDocument();
router.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

router.get('/', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

router.get('/signup', (_req, res) => {
  res.sendFile(path.join(staticDir, 'signup.html'));
});

router.get('/home', (_req, res) => {
  res.sendFile(path.join(staticDir, 'home.html'));
});

router.get('/conversation', (_req, res) => {
  res.sendFile(path.join(staticDir, 'conversation.html'));
});

router.use('/api', signinRouter);
router.use('/api', signupRouter);
router.use('/api', userMessageRouter);
router.use('/api', conversationRouter);

export default router;
