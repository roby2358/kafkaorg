import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, closeDb } from './db/client.js';
import { initSchema } from './db/init-schema.js';
import { closeKafka } from './kafka/index.js';
import { setupWebSocket, closeAllConnections } from './websocket/conversation-handler.js';
import routes from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = parseInt(process.env.PORT || '8821', 10);

const staticDir = path.join(__dirname, '../static');

app.use(express.json());
app.use('/static', express.static(staticDir));
app.use('/', routes);

// Set up WebSocket
setupWebSocket(server);

async function startServer(): Promise<void> {
  try {
    await initDb();
    await initSchema();

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running at http://0.0.0.0:${PORT}`);
      console.log(`WebSocket available at ws://0.0.0.0:${PORT}/ws`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function shutdown(): Promise<void> {
  console.log('\nShutting down...');

  // Close the HTTP server first to stop accepting new connections
  await new Promise<void>((resolve) => {
    server.close(() => {
      console.log('HTTP server closed');
      resolve();
    });
  });

  await closeAllConnections();
  // Note: orchestrationFramework will handle stopping agents
  await closeKafka();
  await closeDb();
}

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

startServer();
