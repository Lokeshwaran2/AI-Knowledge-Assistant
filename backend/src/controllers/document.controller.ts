import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection';
import { ingestDocument } from '../services/ingestion.service';
import { asyncHandler, AppError } from '../utils/errors';
import { SERVER_CONFIG } from '../config/server.config';

// ─── Multer Storage Config ────────────────────────────────────────────────────

const uploadDir = path.resolve(SERVER_CONFIG.uploadDir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

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

    const documentId = uuidv4();
    const { originalname, path: filePath, size } = req.file;

    // Insert document record with 'processing' status
    await pool.query(
      `INSERT INTO documents (id, user_id, name, original_filename, file_size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, 'processing')`,
      [documentId, req.user.userId, originalname, originalname, size]
    );

    // Fire-and-forget — do NOT await (async pipeline)
    ingestDocument(documentId, req.user.userId, filePath, originalname).catch((err) => {
      console.error('[Document] Background ingestion error:', err);
    });

    // Return immediately — senior signal: async pipeline readiness
    res.status(202).json({
      success: true,
      status: 'processing',
      documentId,
      message: 'Document received. Ingestion is running in the background.',
    });
  }),
];

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
