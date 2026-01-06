import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, closeDb } from './db/client.js';
import { initSchema } from './db/init-schema.js';
import routes from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '8821', 10);

const staticDir = path.join(__dirname, '../static');

app.use(express.json());
app.use('/static', express.static(staticDir));
app.use('/', routes);

async function startServer(): Promise<void> {
  try {
    await initDb();
    await initSchema();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running at http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await closeDb();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await closeDb();
  process.exit(0);
});

startServer();
