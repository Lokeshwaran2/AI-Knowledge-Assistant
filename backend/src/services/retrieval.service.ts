// Retrieval Service — finds relevant chunks for a given query embedding
// Controls: Top-K, similarity threshold, metadata filtering

import { generateEmbedding } from './embedding.service';
import { similaritySearch, RetrievedChunk } from './vectordb.service';
import { AI_CONFIG } from '../config/ai.config';

/**
 * Full retrieval pipeline:
 * 1. Embed the user question
 * 2. Search ChromaDB with user-scoped metadata filter
 * 3. Apply similarity threshold to reject low-relevance chunks
 * 4. Return Top-K filtered chunks
 */
export async function retrieveRelevantChunks(
  question: string,
  userId: string
): Promise<RetrievedChunk[]> {
  // Step 1 — Embed the question (same model as ingestion for vector space alignment)
  const queryEmbedding = await generateEmbedding(question);

  // Step 2 — Vector similarity search with user-level metadata filter
  const rawResults = await similaritySearch(queryEmbedding, userId, AI_CONFIG.topK);

  if (rawResults.length === 0) {
    return [];
  }

  // Step 3 — Filter by similarity threshold
  // Cosine similarity: 0 = unrelated, 1 = identical
  // We KEEP chunks ABOVE the threshold (high similarity = relevant)
  const filtered = rawResults.filter(
    (chunk) => chunk.score >= AI_CONFIG.similarityThreshold
  );

  // Step 4 — Return best matches (already ranked by ChromaDB)
  console.log(
    `[Retrieval] Found ${rawResults.length} results, ${filtered.length} passed threshold (≥${AI_CONFIG.similarityThreshold})`
  );

  return filtered;
}
