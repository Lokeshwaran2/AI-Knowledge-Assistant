import 'dotenv/config';
import app from './app';
import { SERVER_CONFIG } from './config/server.config';
import { initializeSchema } from './db/connection';
import { startIngestionWorker } from './workers/ingestion.worker';

const PORT = SERVER_CONFIG.port;

async function start() {
  // Initialize PostgreSQL schema (creates tables if not exist)
  await initializeSchema();

  // Start BullMQ worker process if Redis is enabled
  startIngestionWorker();

  const server = app.listen(PORT, () => {
    console.log(`\n🚀 AI Knowledge Assistant API`);
    console.log(`   Running: http://localhost:${PORT}`);
    console.log(`   Health:  http://localhost:${PORT}/health`);
    console.log(`   DB:      PostgreSQL (Neon Cloud)`);
    console.log(`   Mode:    ${SERVER_CONFIG.nodeEnv}\n`);
  });

  server.on('error', (err) => {
    console.error('[SERVER ERROR]', err);
  });
}

start();
