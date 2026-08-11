import { Router } from 'express';
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
  bulkDeleteDocuments,
} from '../controllers/document.controller';
import { verifyJWT } from '../middleware/auth.middleware';

const router = Router();

// All document routes require authentication
router.use(verifyJWT);

// POST /documents — upload and trigger ingestion
router.post('/', uploadDocument);

// GET /documents — list user's documents
router.get('/', listDocuments);

// DELETE /documents/:id — delete a single document
router.delete('/:id', deleteDocument);

// POST /documents/bulk-delete — delete multiple documents
router.post('/bulk-delete', bulkDeleteDocuments);

export default router;
