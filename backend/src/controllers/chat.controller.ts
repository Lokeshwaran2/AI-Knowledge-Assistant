// Chat Controller — orchestrates the full RAG query pipeline
// Pattern: Embed → Retrieve → Prompt → LLM → Store → Respond
// This controller orchestrates ONLY — zero business logic here

import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../utils/errors';
import { generateEmbedding } from '../services/embedding.service';
import { retrieveRelevantChunks } from '../services/retrieval.service';
import { buildAnswerPrompt, buildNoContextResponse } from '../services/prompt.service';
import { generateLLMResponse } from '../services/llm.service';
import {
  storeMessage,
  createConversation,
  getConversationMessages,
  getUserConversations,
} from '../services/message.service';

// ─── POST /chat ───────────────────────────────────────────────────────────────

export const handleChat = asyncHandler(async (req: Request, res: Response) => {
  const { message, conversationId } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ success: false, message: 'Message is required.' });
    return;
  }

  if (!req.user) throw new AppError('Unauthorized.', 401);

  const { userId } = req.user;

  // Resolve or create conversation
  let convId = conversationId as string | undefined;
  if (!convId) {
    convId = await createConversation(userId, message.slice(0, 60));
  }

  // ── Step 1: Store user message ────────────────────────────────────────────
  await storeMessage({ conversationId: convId, userId, role: 'user', content: message });

  // ── Step 2: Embed user question ───────────────────────────────────────────
  const _embedding = await generateEmbedding(message);

  // ── Step 3: Retrieve relevant chunks ─────────────────────────────────────
  const chunks = await retrieveRelevantChunks(message, userId);

  // ── Step 4: Handle empty retrieval — deterministic refusal ───────────────
  if (chunks.length === 0) {
    const refusal = buildNoContextResponse();

    await storeMessage({
      conversationId: convId,
      userId,
      role: 'assistant',
      content: refusal,
      tokensUsed: 0,
      latencyMs: 0,
      chunksRetrieved: 0,
    });

    res.json({
      success: true,
      conversationId: convId,
      message: refusal,
      tokensUsed: 0,
      latencyMs: 0,
      chunksRetrieved: 0,
    });
    return;
  }

  // ── Step 5: Build grounded prompt ────────────────────────────────────────
  const prompt = buildAnswerPrompt(message, chunks);

  // ── Step 6: Call LLM ─────────────────────────────────────────────────────
  const llmResult = await generateLLMResponse(prompt);

  // ── Step 7: Store assistant message with observability metadata ───────────
  await storeMessage({
    conversationId: convId,
    userId,
    role: 'assistant',
    content: llmResult.answer,
    tokensUsed: llmResult.tokensUsed,
    latencyMs: llmResult.latencyMs,
    chunksRetrieved: chunks.length,
  });

  // ── Step 8: Return response with metadata ─────────────────────────────────
  res.json({
    success: true,
    conversationId: convId,
    message: llmResult.answer,
    tokensUsed: llmResult.tokensUsed,
    latencyMs: llmResult.latencyMs,
    chunksRetrieved: chunks.length,
    model: llmResult.model,
  });
});

// ─── GET /chat/conversations ──────────────────────────────────────────────────

export const getConversations = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized.', 401);

  const conversations = await getUserConversations(req.user.userId);
  res.json({ success: true, conversations });
});

// ─── GET /chat/conversations/:id/messages ─────────────────────────────────────

export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized.', 401);

  const id = req.params['id'] as string;
  const messages = await getConversationMessages(id);
  res.json({ success: true, messages });
});
