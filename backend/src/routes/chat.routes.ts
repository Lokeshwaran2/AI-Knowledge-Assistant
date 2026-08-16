import { Router } from 'express';
import {
  handleChat,
  handleChatStream,
  handleDebugStream,
  handleDebugSSE,
  handleDebugStreamLLM,
  getConversations,
  getMessages,
  deleteConversationHandler,
} from '../controllers/chat.controller';
import { verifyJWT } from '../middleware/auth.middleware';

const router = Router();

// Diagnostic endpoints (unauthenticated for curl testing)
router.get('/debug-stream', handleDebugStream);
router.get('/debug-sse', handleDebugSSE);
router.get('/debug-stream-llm', handleDebugStreamLLM);

router.use(verifyJWT);

// POST /chat/stream — real-time SSE stream endpoint
router.post('/stream', handleChatStream);

// POST /chat — send a message, receive grounded AI response (batch mode)
router.post('/', handleChat);

// GET /chat/conversations — list user's conversations
router.get('/conversations', getConversations);

// GET /chat/conversations/:id/messages — get messages in a conversation
router.get('/conversations/:id/messages', getMessages);

// DELETE /chat/conversations/:id — delete a conversation
router.delete('/conversations/:id', deleteConversationHandler);

export default router;
