// Ingestion Service — orchestrates the full document ingestion pipeline
// Flow: Extract Text (RAM) → Chunk → Embed → Store in pgvector (Neon Cloud) → Update DB status + Emit SSE Progress

import path from 'path';
import { pool } from '../db/connection';
import { chunkText } from './chunking.service';
import { generateEmbeddingsBatch } from './embedding.service';
import { storeChunks, ChunkMetadata } from './vectordb.service';
import { sseService } from './sse.service';

// ─── Main Ingestion Function ──────────────────────────────────────────────────

export async function ingestDocument(
  documentId: string,
  userId: string,
  fileBuffer: Buffer,
  originalFilename: string
): Promise<void> {
  console.log(`[Ingestion] Starting for document ${documentId}`);

  try {
    // Stage 1: Extraction
    sseService.emitProgress(userId, {
      documentId,
      status: 'processing',
      stage: 'extraction',
      progress: 10,
      message: 'Extracting document text...',
    });

    const rawText = await extractText(fileBuffer, originalFilename);
    console.log(`[Ingestion] Extracted ${rawText.length} characters`);

    // Stage 2: Chunking
    sseService.emitProgress(userId, {
      documentId,
      status: 'processing',
      stage: 'chunking',
      progress: 30,
      message: `Extracted ${rawText.length} characters. Splitting into text chunks...`,
    });

    const chunks = chunkText(rawText);
    console.log(`[Ingestion] Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      await updateDocumentStatus(documentId, 'failed', 0);
      sseService.emitProgress(userId, {
        documentId,
        status: 'failed',
        stage: 'failed',
        progress: 100,
        message: 'No readable text content found in document.',
      });
      return;
    }

    // Stage 3: Embedding Generation
    sseService.emitProgress(userId, {
      documentId,
      status: 'processing',
      stage: 'embedding',
      progress: 40,
      message: `Created ${chunks.length} chunks. Generating vector embeddings...`,
    });

    const embeddings = await generateEmbeddingsBatch(chunks, 4, (processed, total) => {
      const pct = Math.round(40 + (processed / total) * 40); // 40% to 80% range
      sseService.emitProgress(userId, {
        documentId,
        status: 'processing',
        stage: 'embedding',
        progress: pct,
        message: `Generated embeddings for ${processed}/${total} chunks (${Math.round((processed / total) * 100)}%)...`,
      });
    });
    console.log(`[Ingestion] Generated ${embeddings.length} embeddings`);

    // Stage 4: Vector Storage
    sseService.emitProgress(userId, {
      documentId,
      status: 'processing',
      stage: 'storing',
      progress: 85,
      message: 'Storing vector embeddings in pgvector database...',
    });

    const metadata: ChunkMetadata[] = chunks.map((doc, i) => ({
      documentId,
      userId,
      chunkIndex: i,
      source: originalFilename,
    }));

    await storeChunks(chunks, embeddings, metadata);

    // Stage 5: Completion
    await updateDocumentStatus(documentId, 'ready', chunks.length);

    sseService.emitProgress(userId, {
      documentId,
      status: 'ready',
      stage: 'completed',
      progress: 100,
      message: 'Document ingestion complete! Ready for search and chat.',
      chunkCount: chunks.length,
    });

    console.log(`[Ingestion] Document ${documentId} ready.`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error during ingestion.';
    console.error(`[Ingestion] Failed for document ${documentId}:`, errMsg);
    await updateDocumentStatus(documentId, 'failed', 0);

    sseService.emitProgress(userId, {
      documentId,
      status: 'failed',
      stage: 'failed',
      progress: 100,
      message: `Ingestion failed: ${errMsg}`,
    });
  }
}

// ─── Text Extraction ──────────────────────────────────────────────────────────

async function extractText(fileBuffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fileBuffer);
      if (!data || typeof data.text !== 'string' || !data.text.trim()) {
        throw new Error('PDF file contains no readable text or is image-only/scanned.');
      }
      return data.text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse PDF file.';
      console.error('[Ingestion] PDF parse error:', msg);
      throw new Error(`PDF processing error: ${msg}`);
    }
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
