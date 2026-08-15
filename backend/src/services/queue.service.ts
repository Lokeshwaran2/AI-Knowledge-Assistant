// Queue Service — BullMQ job queue producer for asynchronous document ingestion
// Decouples long-running ingestion from HTTP request threads to prevent gateway timeouts

import { Queue } from 'bullmq';
import { REDIS_CONFIG, getRedisOptions } from '../config/redis.config';
import { ingestDocument } from './ingestion.service';

export interface IngestionJobData {
  documentId: string;
  userId: string;
  fileBufferBase64: string; // Base64 encoded file buffer for JSON serialization
  originalFilename: string;
}

export const INGESTION_QUEUE_NAME = 'document-ingestion-queue';

let bullQueue: Queue | null = null;

if (REDIS_CONFIG.isEnabled) {
  try {
    bullQueue = new Queue(INGESTION_QUEUE_NAME, {
      connection: getRedisOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
    console.log('[Queue] BullMQ job queue initialized with Upstash Redis connection ✓');
  } catch (err) {
    console.warn('[Queue] Failed to initialize BullMQ queue with Redis, using async fallback:', err);
  }
} else {
  console.log('[Queue] REDIS_URL not configured. Running queue tasks in async background execution mode.');
}

/**
 * Enqueue document ingestion task to BullMQ Redis Queue or async fallback
 */
export async function enqueueIngestionJob(data: IngestionJobData): Promise<void> {
  if (bullQueue) {
    await bullQueue.add('ingest', data, {
      jobId: data.documentId,
    });
    console.log(`[Queue] Enqueued ingestion job ${data.documentId} to BullMQ queue`);
  } else {
    // Graceful Fallback if Redis is not configured: async execution
    const buffer = Buffer.from(data.fileBufferBase64, 'base64');
    ingestDocument(data.documentId, data.userId, buffer, data.originalFilename).catch((err) => {
      console.error(`[Queue] Fallback async ingestion error for ${data.documentId}:`, err);
    });
  }
}
