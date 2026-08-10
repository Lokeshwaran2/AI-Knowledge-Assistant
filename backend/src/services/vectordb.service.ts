// Vector DB Service — Native PostgreSQL pgvector Store (Neon Cloud)
// Zero local disk storage dependencies, 100% production ready

import { pool } from '../db/connection';
import { AI_CONFIG } from '../config/ai.config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChunkMetadata {
  documentId: string;
  userId: string;
  chunkIndex: number;
  source: string;
}

export interface StoredChunk {
  id: string;
  embedding: number[];
  text: string;
  metadata: ChunkMetadata;
}

export interface RetrievedChunk {
  text: string;
  score: number; // Cosine similarity (higher = more relevant, 0–1)
  metadata: ChunkMetadata;
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkVectorDbHealth(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch {
    return false;
  }
}

// ─── Store Chunks ─────────────────────────────────────────────────────────────

export async function storeChunks(
  chunks: string[],
  embeddings: number[][],
  metadata: ChunkMetadata[]
): Promise<void> {
  if (chunks.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Batch insert into document_chunks
    const batchSize = 100;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const chunkBatch = chunks.slice(i, i + batchSize);
      const embedBatch = embeddings.slice(i, i + batchSize);
      const metaBatch = metadata.slice(i, i + batchSize);

      for (let j = 0; j < chunkBatch.length; j++) {
        const text = chunkBatch[j];
        const embeddingStr = `[${embedBatch[j].join(',')}]`;
        const meta = metaBatch[j];

        await client.query(
          `INSERT INTO document_chunks (document_id, user_id, chunk_index, chunk_text, embedding, source)
           VALUES ($1, $2, $3, $4, $5::vector, $6)`,
          [meta.documentId, meta.userId, meta.chunkIndex, text, embeddingStr, meta.source]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`[pgvector] Stored ${chunks.length} vector chunks in Neon PostgreSQL`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[pgvector] Failed to store vector chunks:', err);
    throw err;
  } finally {
    client.release();
  }
}

// ─── Similarity Search ────────────────────────────────────────────────────────

export async function similaritySearch(
  queryEmbedding: number[],
  userId: string,
  topK: number = AI_CONFIG.topK
): Promise<RetrievedChunk[]> {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Cosine Distance operator <=>
  // Cosine Similarity = 1 - (embedding <=> queryEmbedding)
  const result = await pool.query(
    `SELECT chunk_text, document_id, user_id, chunk_index, source,
            1 - (embedding <=> $1::vector) AS similarity
     FROM document_chunks
     WHERE user_id = $2
     ORDER BY embedding <=> $1::vector ASC
     LIMIT $3`,
    [embeddingStr, userId, topK]
  );

  return result.rows.map((row) => ({
    text: row.chunk_text,
    score: parseFloat(row.similarity),
    metadata: {
      documentId: row.document_id,
      userId: row.user_id,
      chunkIndex: parseInt(row.chunk_index, 10),
      source: row.source,
    },
  }));
}

// ─── Delete Chunks ────────────────────────────────────────────────────────────

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  await pool.query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
  console.log(`[pgvector] Deleted vector chunks for document ${documentId}`);
}

