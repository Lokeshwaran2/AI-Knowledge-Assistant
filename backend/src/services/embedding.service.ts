// Embedding Service — local inference using @xenova/transformers
// Model: all-MiniLM-L6-v2 (384-dim, ~25MB, downloads once on first run)
// Zero API key required — fully offline after first download

import os from 'os';
import path from 'path';
import { AI_CONFIG } from '../config/ai.config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipeline: any = null;
let isLoading = false;

async function getEmbeddingPipeline() {
  if (pipeline) return pipeline;

  if (isLoading) {
    // Wait for existing load to complete
    while (isLoading) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return pipeline;
  }

  isLoading = true;
  console.log('[Embedding] Loading local model (first run may take a moment to download ~25MB)...');

  try {
    // Dynamic import to avoid top-level ESM issues
    const { pipeline: createPipeline, env } = await import('@xenova/transformers');

    // Use OS temp directory for model cache to support read-only filesystems & cloud containers
    env.cacheDir = path.join(os.tmpdir(), 'model_cache');
    env.allowRemoteModels = true;

    pipeline = await createPipeline('feature-extraction', AI_CONFIG.embeddingModel);
    console.log('[Embedding] Local model loaded successfully.');
    isLoading = false;
    return pipeline;
  } catch (err) {
    isLoading = false;
    console.error('[Embedding] Failed to load embedding model:', err);
    throw err;
  }
}

/**
 * Convert text to an embedding vector
 * Returns a number[] of length 384 (all-MiniLM-L6-v2)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();

  const output = await pipe(text, { pooling: 'mean', normalize: true });

  // Convert Float32Array to regular number[]
  return Array.from(output.data as Float32Array);
}

/**
 * Generate embeddings for multiple texts in batch
 * Sub-batches input to prevent ONNX runtime OOM errors on large documents.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize: number = 32,
  onProgress?: (processed: number, total: number) => void
): Promise<number[][]> {
  const pipe = await getEmbeddingPipeline();
  const dim = AI_CONFIG.embeddingDimension;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const chunkBatch = texts.slice(i, i + batchSize);
    const output = await pipe(chunkBatch, { pooling: 'mean', normalize: true });

    for (let j = 0; j < chunkBatch.length; j++) {
      allEmbeddings.push(Array.from(output.data.slice(j * dim, (j + 1) * dim) as Float32Array));
    }

    if (onProgress) {
      onProgress(allEmbeddings.length, texts.length);
    }
  }

  return allEmbeddings;
}
