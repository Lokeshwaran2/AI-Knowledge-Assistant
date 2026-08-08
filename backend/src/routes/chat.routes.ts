import { Router } from 'express';
import { handleChat, getConversations, getMessages } from '../controllers/chat.controller';
import { verifyJWT } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyJWT);

// POST /chat — send a message, receive grounded AI response
router.post('/', handleChat);

// GET /chat/conversations — list user's conversations
router.get('/conversations', getConversations);

// GET /chat/conversations/:id/messages — get messages in a conversation
router.get('/conversations/:id/messages', getMessages);

export default router;
