import { Router } from 'express';
import { uploadDocument, listDocuments } from '../controllers/document.controller';
import { verifyJWT } from '../middleware/auth.middleware';

const router = Router();

// All document routes require authentication
router.use(verifyJWT);

// POST /documents — upload and trigger ingestion
router.post('/', uploadDocument);

// GET /documents — list user's documents
router.get('/', listDocuments);

export default router;
