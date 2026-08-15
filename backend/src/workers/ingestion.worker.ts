// Ingestion Worker — Standalone BullMQ Worker process for consuming ingestion jobs
// Purpose: Isolates heavy PDF extraction, chunking, and embedding generation from HTTP web server threads

import { Worker, Job } from 'bullmq';
import { REDIS_CONFIG, getRedisOptions } from '../config/redis.config';
import { INGESTION_QUEUE_NAME, IngestionJobData } from '../services/queue.service';
import { ingestDocument } from '../services/ingestion.service';

let worker: Worker | null = null;

export function startIngestionWorker(): Worker | null {
  if (!REDIS_CONFIG.isEnabled) {
    console.log('[Worker] REDIS_URL not configured. Standalone worker process inactive (using fallback engine).');
    return null;
  }

  if (worker) return worker;

  worker = new Worker<IngestionJobData>(
    INGESTION_QUEUE_NAME,
    async (job: Job<IngestionJobData>) => {
      console.log(`[Worker] Processing ingestion job ${job.id} (Document: ${job.data.documentId})`);
      const { documentId, userId, fileBufferBase64, originalFilename } = job.data;
      const fileBuffer = Buffer.from(fileBufferBase64, 'base64');

      await ingestDocument(documentId, userId, fileBuffer, originalFilename);
      console.log(`[Worker] Successfully completed job ${job.id}`);
    },
    {
      connection: getRedisOptions(),
      concurrency: 2, // Concurrency limit = 2 jobs at a time to prevent RAM spikes on 512MB hosts
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed with error:`, err);
  });

  console.log('[Worker] BullMQ Ingestion Worker started (Concurrency: 2) ✓');
  return worker;
}
