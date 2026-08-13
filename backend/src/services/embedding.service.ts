// Embedding Service — Production Dual-Engine (Remote API + Local ONNX Fallback)
// Model: sentence-transformers/all-MiniLM-L6-v2 (384-dim)
// Uses Remote API in production for ZERO RAM overhead (prevents 512MB RAM server OOM crashes)

import os from 'os';
import path from 'path';
import { AI_CONFIG } from '../config/ai.config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipeline: any = null;
let isLoading = false;

// ─── Remote Embedding Engine (Zero Server RAM) ──────────────────────────────

async function generateRemoteEmbeddings(texts: string[]): Promise<number[][] | null> {
  try {
    const hfToken = process.env.HF_TOKEN;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (hfToken) {
      headers['Authorization'] = `Bearer ${hfToken}`;
    }

    const endpoints = [
      'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2',
      'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2',
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            inputs: texts,
            options: { wait_for_model: true, use_cache: true },
          }),
        });

        if (!response.ok) continue;

        const data = await response.json();
        const parsed = parseHfResponse(data, texts.length);
        if (parsed && parsed.length === texts.length) {
          return parsed;
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch (err) {
    console.warn('[Embedding] Remote API error:', err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseHfResponse(data: any, expectedCount: number): number[][] | null {
  if (!Array.isArray(data) || data.length === 0) return null;

  // 1. Array of vectors: [[384 numbers], [384 numbers], ...]
  if (typeof data[0][0] === 'number') {
    if (data.length === expectedCount && data[0].length === AI_CONFIG.embeddingDimension) {
      return data as number[][];
    }
  }

  // 2. Token-level 3D array: [batch, sequence_length, dim] -> Mean Pooling
  if (Array.isArray(data[0]) && Array.isArray(data[0][0])) {
    return data.map((tokenEmbeddings: number[][]) => {
      const dim = tokenEmbeddings[0].length;
      const mean = new Array(dim).fill(0);
      for (const token of tokenEmbeddings) {
        for (let i = 0; i < dim; i++) mean[i] += token[i];
      }
      for (let i = 0; i < dim; i++) mean[i] /= tokenEmbeddings.length;
      // Cosine Normalization
      const norm = Math.sqrt(mean.reduce((sum, val) => sum + val * val, 0)) || 1;
      return mean.map((val) => val / norm);
    });
  }

  return null;
}

// ─── Local ONNX Engine (Development / Fallback) ──────────────────────────────

async function getLocalEmbeddingPipeline() {
  if (pipeline) return pipeline;

  if (isLoading) {
    while (isLoading) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return pipeline;
  }

  isLoading = true;
  console.log('[Embedding] Loading local ONNX model (first run may download ~25MB)...');

  try {
    const { pipeline: createPipeline, env } = await import('@xenova/transformers');

    // Use OS temp directory for model cache to support read-only filesystems & cloud containers
    // Cache model in project directory
    env.cacheDir = './.model_cache';
    // Use OS temp directory for model cache to support read-only filesystems & cloud containers
    env.cacheDir = path.join(os.tmpdir(), 'model_cache');
    env.allowRemoteModels = true;

    pipeline = await createPipeline('feature-extraction', AI_CONFIG.embeddingModel);
    console.log('[Embedding] Local ONNX model loaded successfully.');
    isLoading = false;
    return pipeline;
  } catch (err) {
    isLoading = false;
    console.error('[Embedding] Failed to load embedding model:', err);
    console.error('[Embedding] Local ONNX model failed to load:', err);
    console.error('[Embedding] Failed to load embedding model:', err);
    throw err;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateEmbedding(text: string): Promise<number[]> {
  const batch = await generateEmbeddingsBatch([text], 1);
  return batch[0];
}

export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize: number = 8,
  onProgress?: (processed: number, total: number) => void
): Promise<number[][]> {
  if (texts.length === 0) return [];

  // 1. Production Mode or Remote Preference: Try Remote API (0 MB RAM overhead)
  if (process.env.NODE_ENV === 'production' || process.env.USE_REMOTE_EMBEDDINGS === 'true') {
    console.log(`[Embedding] Generating remote API embeddings for ${texts.length} chunks...`);

    const allRemoteEmbeddings: number[][] = [];
    const apiBatchSize = 16; // HuggingFace API batch limit

    let success = true;
    for (let i = 0; i < texts.length; i += apiBatchSize) {
      const chunkBatch = texts.slice(i, i + apiBatchSize);
      const res = await generateRemoteEmbeddings(chunkBatch);
      if (res) {
        allRemoteEmbeddings.push(...res);
        if (onProgress) onProgress(allRemoteEmbeddings.length, texts.length);
      } else {
        success = false;
        break;
      }
    }

    if (success && allRemoteEmbeddings.length === texts.length) {
      console.log(`[Embedding] Successfully generated ${texts.length} remote embeddings (0 MB RAM used).`);
      return allRemoteEmbeddings;
    }

    console.warn('[Embedding] Remote API unavailable/failed, attempting local ONNX fallback...');
  }

  // 2. Local ONNX Engine Fallback
  try {
    const pipe = await getLocalEmbeddingPipeline();
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
  } catch (localErr) {
    console.error('[Embedding] Local ONNX engine failed:', localErr);
    throw new Error('Embedding generation failed on both remote API and local engine.');
  }
}
