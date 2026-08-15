import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection';
import { ingestDocument } from '../services/ingestion.service';
import { deleteDocumentChunks } from '../services/vectordb.service';
import { asyncHandler, AppError } from '../utils/errors';
import { SERVER_CONFIG } from '../config/server.config';

// ─── Multer Storage Config ────────────────────────────────────────────────────

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: SERVER_CONFIG.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new AppError('Only PDF, TXT, and MD files are supported.', 400));
    }
  },
});

import { enqueueIngestionJob } from '../services/queue.service';
import { sseService } from '../services/sse.service';

// ─── Upload Document ─────────────────────────────────────────────────────────

export const uploadDocument = [
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded.' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized.' });
      return;
    }

    const { originalname, buffer, size } = req.file;

    // Magic Byte file signature validation for PDF files
    const ext = path.extname(originalname).toLowerCase();
    if (ext === '.pdf') {
      const isPdfHeader = buffer.length >= 4 && buffer.toString('utf-8', 0, 5).startsWith('%PDF-');
      if (!isPdfHeader) {
        res.status(400).json({
          success: false,
          message: 'Invalid file content. Uploaded file extension is .pdf but binary content does not match PDF magic bytes.',
        });
        return;
      }
    }

    // Clean up any previously failed document entry with the same filename for this user
    await pool.query(
      `DELETE FROM documents WHERE user_id = $1 AND original_filename = $2 AND status = 'failed'`,
      [req.user.userId, originalname]
    );

    const documentId = uuidv4();

    // Insert document record with 'processing' status
    await pool.query(
      `INSERT INTO documents (id, user_id, name, original_filename, file_size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, 'processing')`,
      [documentId, req.user.userId, originalname, originalname, size]
    );

    // Enqueue job to BullMQ Queue (or async fallback)
    await enqueueIngestionJob({
      documentId,
      userId: req.user.userId,
      fileBufferBase64: buffer.toString('base64'),
      originalFilename: originalname,
    });

    res.status(202).json({
      success: true,
      status: 'processing',
      documentId,
      message: 'Document received. Ingestion job enqueued for background processing.',
    });
  }),
];

// ─── Stream Document Real-Time Progress Events (SSE) ────────────────────────

export const streamDocumentEvents = (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized.' });
    return;
  }
  sseService.registerConnection(req.user.userId, res);
};

// ─── List Documents ───────────────────────────────────────────────────────────

export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized.' });
    return;
  }

  const result = await pool.query(
    `SELECT id, name, original_filename, file_size_bytes, status, chunk_count, created_at
     FROM documents WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.userId]
  );

  res.json({ success: true, documents: result.rows });
});

// ─── Delete Single Document ───────────────────────────────────────────────────

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized.' });
    return;
  }

  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

  const check = await pool.query('SELECT id FROM documents WHERE id = $1 AND user_id = $2', [
    id,
    req.user.userId,
  ]);

  if (check.rows.length === 0) {
    res.status(404).json({ success: false, message: 'Document not found.' });
    return;
  }

  await pool.query('DELETE FROM documents WHERE id = $1 AND user_id = $2', [id, req.user.userId]);

  await deleteDocumentChunks(id).catch((err) => {
    console.warn(`[Document] Failed to clean up chunks for ${id}:`, err);
  });

  res.json({ success: true, message: 'Document deleted successfully.' });
});

// ─── Bulk Delete Documents ────────────────────────────────────────────────────

export const bulkDeleteDocuments = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized.' });
    return;
  }

  const { documentIds } = req.body;

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    res.status(400).json({ success: false, message: 'No document IDs provided.' });
    return;
  }

  const result = await pool.query(
    'DELETE FROM documents WHERE id = ANY($1::uuid[]) AND user_id = $2 RETURNING id',
    [documentIds, req.user.userId]
  );

  const deletedIds = result.rows.map((row) => row.id);

  for (const id of deletedIds) {
    await deleteDocumentChunks(id).catch((err) => {
      console.warn(`[Document] Failed to clean up chunks for ${id}:`, err);
    });
  }

  res.json({
    success: true,
    deletedCount: deletedIds.length,
    message: `${deletedIds.length} document(s) deleted successfully.`,
  });
});

