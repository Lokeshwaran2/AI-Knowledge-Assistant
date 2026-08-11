// Ingestion Service — orchestrates the full document ingestion pipeline
// Flow: Extract Text (RAM) → Chunk → Embed → Store in pgvector (Neon Cloud) → Update DB status

import path from 'path';
import { pool } from '../db/connection';
import { chunkText } from './chunking.service';
import { generateEmbeddingsBatch } from './embedding.service';
import { storeChunks, ChunkMetadata } from './vectordb.service';

// ─── Main Ingestion Function ──────────────────────────────────────────────────

export async function ingestDocument(
  documentId: string,
  userId: string,
  fileBuffer: Buffer,
  originalFilename: string
): Promise<void> {
  console.log(`[Ingestion] Starting for document ${documentId}`);

  try {
    // Step 1 — Extract text from Buffer in RAM
    const rawText = await extractText(fileBuffer, originalFilename);
    console.log(`[Ingestion] Extracted ${rawText.length} characters`);

    // Step 2 — Chunk the text
    const chunks = chunkText(rawText);
    console.log(`[Ingestion] Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      await updateDocumentStatus(documentId, 'failed', 0);
      return;
    }

    // Step 3 — Generate embeddings in batch (sub-batched safely to prevent OOM)
    const embeddings = await generateEmbeddingsBatch(chunks, 32, (processed, total) => {
      if (processed % 160 === 0 || processed === total) {
        console.log(`[Ingestion] Embedding progress: ${processed}/${total} chunks (${Math.round((processed / total) * 100)}%)`);
      }
    });
    console.log(`[Ingestion] Generated ${embeddings.length} embeddings`);

    // Step 4 — Build metadata for each chunk
    const metadata: ChunkMetadata[] = chunks.map((doc, i) => ({
      documentId,
      userId,
      chunkIndex: i,
      source: originalFilename,
    }));

    // Step 5 — Store in pgvector (Neon PostgreSQL Cloud)
    await storeChunks(chunks, embeddings, metadata);

    // Step 6 — Update document status to ready
    await updateDocumentStatus(documentId, 'ready', chunks.length);

    console.log(`[Ingestion] Document ${documentId} ready.`);
  } catch (err) {
    console.error(`[Ingestion] Failed for document ${documentId}:`, err);
    await updateDocumentStatus(documentId, 'failed', 0);
  }
}

// ─── Text Extraction ──────────────────────────────────────────────────────────

async function extractText(fileBuffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fileBuffer);
    return data.text;
  }

  if (ext === '.txt' || ext === '.md') {
    return fileBuffer.toString('utf-8');
  }

  throw new Error(`Unsupported file type: ${ext}. Supported: PDF, TXT, MD`);
}

// ─── Status Update ────────────────────────────────────────────────────────────

async function updateDocumentStatus(
  documentId: string,
  status: 'processing' | 'ready' | 'failed',
  chunkCount: number
): Promise<void> {
  await pool.query(
    'UPDATE documents SET status = $1, chunk_count = $2, updated_at = NOW() WHERE id = $3',
    [status, chunkCount, documentId]
  );
}

