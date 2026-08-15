// Ingestion Service — orchestrates the full document ingestion pipeline
// Flow: Extract Text (RAM) → Chunk → Embed → Store in pgvector (Neon Cloud) → Update DB status + Emit SSE Progress
// Features: Comprehensive Stage-by-Stage Performance & Timing Telemetry

import path from 'path';
import { pool } from '../db/connection';
import { chunkText } from './chunking.service';
import { generateEmbeddingsBatch } from './embedding.service';
import { storeChunks, ChunkMetadata } from './vectordb.service';
import { sseService } from './sse.service';

interface ExtractionResult {
  text: string;
  numPages: number;
}

// ─── Main Ingestion Function ──────────────────────────────────────────────────

export async function ingestDocument(
  documentId: string,
  userId: string,
  fileBuffer: Buffer,
  originalFilename: string
): Promise<void> {
  const totalStartTime = Date.now();
  console.log(`\n[Ingestion] Starting ingestion for document: "${originalFilename}" (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);

  try {
    // ── STAGE 1: Extraction ──────────────────────────────────────────────────
    const t0 = Date.now();
    sseService.emitProgress(userId, {
      documentId,
      status: 'processing',
      stage: 'extraction',
      progress: 10,
      message: 'Extracting document text...',
    });

    const { text: rawText, numPages } = await extractText(fileBuffer, originalFilename);
    const extractionDurationSec = (Date.now() - t0) / 1000;

    // ── STAGE 2: Chunking ────────────────────────────────────────────────────
    const t1 = Date.now();
    sseService.emitProgress(userId, {
      documentId,
      status: 'processing',
      stage: 'chunking',
      progress: 30,
      message: `Extracted ${rawText.length.toLocaleString()} characters across ${numPages} page(s). Splitting into text chunks...`,
    });

    const chunks = chunkText(rawText);
    const chunkingDurationSec = (Date.now() - t1) / 1000;

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

    // ── STAGE 3: Embedding Generation ───────────────────────────────────────
    const t2 = Date.now();
    sseService.emitProgress(userId, {
      documentId,
      status: 'processing',
      stage: 'embedding',
      progress: 40,
      message: `Created ${chunks.length.toLocaleString()} chunks. Generating vector embeddings...`,
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
    const embeddingDurationSec = (Date.now() - t2) / 1000;

    // ── STAGE 4: Vector DB Insertion ─────────────────────────────────────────
    const t3 = Date.now();
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
    const dbDurationSec = (Date.now() - t3) / 1000;

    // ── STAGE 5: Completion & Summary Printing ──────────────────────────────
    const totalDurationSec = (Date.now() - totalStartTime) / 1000;
    await updateDocumentStatus(documentId, 'ready', chunks.length);

    sseService.emitProgress(userId, {
      documentId,
      status: 'ready',
      stage: 'completed',
      progress: 100,
      message: 'Document ingestion complete! Ready for search and chat.',
      chunkCount: chunks.length,
    });

    // Output Telemetry Table to Console
    printIngestionTelemetry({
      filename: originalFilename,
      fileSizeMb: (fileBuffer.length / (1024 * 1024)).toFixed(2) + ' MB',
      pages: numPages,
      extractedChars: rawText.length.toLocaleString(),
      chunksCount: chunks.length.toLocaleString(),
      extractionTime: formatDuration(extractionDurationSec),
      chunkingTime: formatDuration(chunkingDurationSec),
      embeddingTime: formatDuration(embeddingDurationSec),
      dbInsertionTime: formatDuration(dbDurationSec),
      totalTime: formatDuration(totalDurationSec),
    });
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

async function extractText(fileBuffer: Buffer, filename: string): Promise<ExtractionResult> {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fileBuffer);
      if (!data || typeof data.text !== 'string' || !data.text.trim()) {
        throw new Error('PDF file contains no readable text or is image-only/scanned.');
      }
      return {
        text: data.text,
        numPages: data.numpages || 1,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse PDF file.';
      console.error('[Ingestion] PDF parse error:', msg);
      throw new Error(`PDF processing error: ${msg}`);
    }
  }

  if (ext === '.txt' || ext === '.md') {
    const text = fileBuffer.toString('utf-8');
    return {
      text,
      numPages: 1,
    };
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

// ─── Telemetry Formatting & Printing ───────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)} sec`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins} min ${secs} sec`;
}

interface TelemetryReport {
  filename: string;
  fileSizeMb: string;
  pages: number;
  extractedChars: string;
  chunksCount: string;
  extractionTime: string;
  chunkingTime: string;
  embeddingTime: string;
  dbInsertionTime: string;
  totalTime: string;
}

function printIngestionTelemetry(report: TelemetryReport): void {
  const pad = (str: string, len: number) => str.padEnd(len, ' ');

  console.log('\n┌────────────────────────────────────────────────────────────┐');
  console.log('│              INGESTION STAGE TIMING & TELEMETRY            │');
  console.log('├──────────────────────┬─────────────────────────────────────┤');
  console.log(`│ File Name            │ ${pad(report.filename.slice(0, 35), 35)} │`);
  console.log(`│ File Size            │ ${pad(report.fileSizeMb, 35)} │`);
  console.log(`│ Pages                │ ${pad(report.pages + ' pages', 35)} │`);
  console.log(`│ Extracted Characters │ ${pad(report.extractedChars + ' chars', 35)} │`);
  console.log(`│ Total Chunks         │ ${pad(report.chunksCount + ' chunks', 35)} │`);
  console.log('├──────────────────────┼─────────────────────────────────────┤');
  console.log(`│ Extraction           │ ${pad(report.extractionTime, 35)} │`);
  console.log(`│ Chunking             │ ${pad(report.chunkingTime, 35)} │`);
  console.log(`│ Embedding            │ ${pad(report.embeddingTime, 35)} │`);
  console.log(`│ DB Insertion         │ ${pad(report.dbInsertionTime, 35)} │`);
  console.log('├──────────────────────┼─────────────────────────────────────┤');
  console.log(`│ TOTAL                │ ${pad(report.totalTime, 35)} │`);
  console.log('└────────────────────────────────────────────────────────────┘\n');
}
