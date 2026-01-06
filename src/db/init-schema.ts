import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function initSchema(): Promise<void> {
  const schemaFile = join(__dirname, '../../db/schema.sql');
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/kafkaorg';

  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();
    const schemaSql = readFileSync(schemaFile, 'utf-8');
    await client.query(schemaSql);
    console.log(`Database schema initialized from ${schemaFile}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log('Database schema already initialized');
    } else {
      console.error(`Failed to initialize schema: ${error}`);
      throw error;
    }
  } finally {
    await client.end();
  }
}
