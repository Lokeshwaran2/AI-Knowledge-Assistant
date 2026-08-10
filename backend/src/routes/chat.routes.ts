import { Router } from 'express';
import {
  handleChat,
  getConversations,
  getMessages,
  deleteConversationHandler,
} from '../controllers/chat.controller';
import { verifyJWT } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyJWT);

// POST /chat — send a message, receive grounded AI response
router.post('/', handleChat);

// GET /chat/conversations — list user's conversations
router.get('/conversations', getConversations);

// GET /chat/conversations/:id/messages — get messages in a conversation
router.get('/conversations/:id/messages', getMessages);

// DELETE /chat/conversations/:id — delete a conversation
router.delete('/conversations/:id', deleteConversationHandler);

export default router;
