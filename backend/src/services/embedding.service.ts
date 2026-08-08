// Embedding Service — local inference using @xenova/transformers
// Model: all-MiniLM-L6-v2 (384-dim, ~25MB, downloads once on first run)
// Zero API key required — fully offline after first download

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

    // Cache model in project directory
    env.cacheDir = './.model_cache';
    env.allowRemoteModels = true;

    pipeline = await createPipeline('feature-extraction', AI_CONFIG.embeddingModel);
    console.log('[Embedding] Local model loaded successfully.');
    isLoading = false;
    return pipeline;
  } catch (err) {
    isLoading = false;
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
 * More efficient than calling generateEmbedding() in a loop
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const pipe = await getEmbeddingPipeline();

  const output = await pipe(texts, { pooling: 'mean', normalize: true });

  // Split flat output into per-text embeddings
  const dim = AI_CONFIG.embeddingDimension;
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i++) {
    embeddings.push(Array.from(output.data.slice(i * dim, (i + 1) * dim) as Float32Array));
  }

  return embeddings;
}
