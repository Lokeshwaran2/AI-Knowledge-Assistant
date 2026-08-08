// Ingestion Service — orchestrates the full document ingestion pipeline
// Flow: Extract Text → Chunk → Embed → Store in Vector DB → Update DB status

import fs from 'fs';
import path from 'path';
import { pool } from '../db/connection';
import { chunkText } from './chunking.service';
import { generateEmbeddingsBatch } from './embedding.service';
import { storeChunks, ChunkMetadata } from './vectordb.service';

// ─── Main Ingestion Function ──────────────────────────────────────────────────

export async function ingestDocument(
  documentId: string,
  userId: string,
  filePath: string,
  originalFilename: string
): Promise<void> {
  console.log(`[Ingestion] Starting for document ${documentId}`);

  try {
    // Step 1 — Extract text from PDF
    const rawText = await extractText(filePath, originalFilename);
    console.log(`[Ingestion] Extracted ${rawText.length} characters`);

    // Step 2 — Chunk the text
    const chunks = chunkText(rawText);
    console.log(`[Ingestion] Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      await updateDocumentStatus(documentId, 'failed', 0);
      return;
    }

    // Step 3 — Generate embeddings in batch (efficient)
    const embeddings = await generateEmbeddingsBatch(chunks);
    console.log(`[Ingestion] Generated ${embeddings.length} embeddings`);

    // Step 4 — Build metadata for each chunk
    const metadata: ChunkMetadata[] = chunks.map((doc, i) => ({
      documentId,
      userId,
      chunkIndex: i,
      source: originalFilename,
    }));

    // Step 5 — Store in ChromaDB
    await storeChunks(chunks, embeddings, metadata);
    console.log(`[Ingestion] Stored ${chunks.length} chunks in vector DB`);

    // Step 6 — Update document status to ready
    await updateDocumentStatus(documentId, 'ready', chunks.length);

    // Cleanup temp file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log(`[Ingestion] Document ${documentId} ready.`);
  } catch (err) {
    console.error(`[Ingestion] Failed for document ${documentId}:`, err);
    await updateDocumentStatus(documentId, 'failed', 0);
  }
}

// ─── Text Extraction ──────────────────────────────────────────────────────────

async function extractText(filePath: string, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf-8');
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
