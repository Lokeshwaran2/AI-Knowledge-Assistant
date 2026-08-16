// Chat Controller — orchestrates the full RAG query pipeline
// Pattern: Embed → Retrieve → Prompt → LLM → Store → Respond
// This controller orchestrates ONLY — zero business logic here

import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../utils/errors';
import { generateEmbedding } from '../services/embedding.service';
import { retrieveRelevantChunks } from '../services/retrieval.service';
import { buildAnswerPrompt, buildNoContextResponse } from '../services/prompt.service';
import { generateLLMResponse, generateLLMResponseStream } from '../services/llm.service';
import {
  storeMessage,
  createConversation,
  getConversationMessages,
  getUserConversations,
  deleteConversation,
} from '../services/message.service';

function sendSSEEvent(res: Response, event: string, data: Record<string, unknown>): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
    (res as unknown as { flush: () => void }).flush();
  }
}

// ─── Debug Endpoints for Forensic Analysis ────────────────────────────────────

export const handleDebugStream = (req: Request, res: Response): void => {
  console.log('[DEBUG-STREAM] Request received');
  console.log('[DEBUG-STREAM] res.constructor.name:', res.constructor.name);
  console.log('[DEBUG-STREAM] res.socket.constructor.name:', res.socket?.constructor?.name);
  console.log('[DEBUG-STREAM] typeof res.flush:', typeof (res as unknown as { flush?: unknown }).flush);
  console.log('[DEBUG-STREAM] typeof res.flushHeaders:', typeof res.flushHeaders);

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let writeCount = 0;
  const sendChunk = (msg: string, delayMs: number) => {
    setTimeout(() => {
      writeCount++;
      const ret = res.write(msg);
      console.log(`[DEBUG-STREAM] WRITE #${writeCount} size=${msg.length} ret=${ret} writableLength=${res.writableLength}`);
    }, delayMs);
  };

  sendChunk('chunk-1\n', 500);
  sendChunk('chunk-2\n', 1000);
  sendChunk('chunk-3\n', 1500);
  setTimeout(() => {
    console.log('[DEBUG-STREAM] ENDing response stream');
    res.end();
  }, 2000);
};

export const handleDebugSSE = (req: Request, res: Response): void => {
  console.log('[DEBUG-SSE] Request received');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let count = 0;
  const sendEvent = (event: string, data: object, delayMs: number) => {
    setTimeout(() => {
      count++;
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      const ret = res.write(payload);
      console.log(`[DEBUG-SSE] WRITE #${count} size=${payload.length} ret=${ret} writableLength=${res.writableLength}`);
    }, delayMs);
  };

  sendEvent('test', { chunk: 'one' }, 500);
  sendEvent('test', { chunk: 'two' }, 1000);
  sendEvent('test', { chunk: 'three' }, 1500);
  setTimeout(() => {
    res.write('event: done\ndata: {}\n\n');
    res.end();
  }, 2000);
};

export const handleDebugStreamLLM = async (req: Request, res: Response): Promise<void> => {
  const message = (req.query['q'] as string) || 'Explain bird migration in 200 words.';
  console.log('[DEBUG-LLM] Request received for prompt:', message);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const startMs = Date.now();
  sendSSEEvent(res, 'start', { timestamp: startMs });

  const abortController = new AbortController();
  const streamGenerator = generateLLMResponseStream(message, abortController.signal, 'debug-llm');

  let tokenCount = 0;
  let firstTokenMs = 0;

  while (true) {
    const { value, done } = await streamGenerator.next();
    if (done) break;
    tokenCount++;
    const now = Date.now();
    if (tokenCount === 1) {
      firstTokenMs = now - startMs;
      console.log(`[DEBUG-LLM] FIRST TOKEN DELIVERED TTFT=${firstTokenMs}ms`);
    }
    const elapsed = now - startMs;
    sendSSEEvent(res, 'token', { tokenCount, elapsedMs: elapsed, delta: value });
  }

  const totalMs = Date.now() - startMs;
  console.log(`[DEBUG-LLM] STREAM END totalTokens=${tokenCount} totalMs=${totalMs}ms tokensPerSec=${((tokenCount / (totalMs - firstTokenMs)) * 1000).toFixed(1)}`);
  sendSSEEvent(res, 'done', { totalTokens: tokenCount, totalMs, firstTokenMs });
  res.end();
};

// ─── POST /chat/stream (SSE Real-Time Response Stream) ─────────────────────────

export const handleChatStream = async (req: Request, res: Response): Promise<void> => {
  const { message, conversationId } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ success: false, message: 'Message is required.' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ success: false, message: 'Unauthorized.' });
    return;
  }

  const { userId } = req.user;

  // Resolve or create conversation
  let convId = conversationId as string | undefined;
  if (!convId) {
    convId = await createConversation(userId, message.slice(0, 60));
  }

  // Set SSE Headers to disable buffering across proxy networks (Nginx, Render, Vercel)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as unknown as { flushHeaders?: () => void }).flushHeaders === 'function') {
    (res as unknown as { flushHeaders: () => void }).flushHeaders();
  }

  sendSSEEvent(res, 'start', { conversationId: convId });
  sendSSEEvent(res, 'status', { stage: 'retrieving', message: 'Searching vector knowledge base...' });

  try {
    // ── Step 1: Store user message ────────────────────────────────────────────
    await storeMessage({ conversationId: convId, userId, role: 'user', content: message });

    // ── Step 2: Embed user question ───────────────────────────────────────────
    await generateEmbedding(message);

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

      sendSSEEvent(res, 'token', { delta: refusal });
      sendSSEEvent(res, 'done', {
        conversationId: convId,
        tokensUsed: 0,
        latencyMs: 0,
        chunksRetrieved: 0,
        model: 'none',
      });
      res.end();
      return;
    }

    const streamId = (req.id || 'stream-' + Date.now().toString(36)).slice(0, 12);
    const streamStart = Date.now();
    const prompt = buildAnswerPrompt(message, chunks);
    sendSSEEvent(res, 'status', { stage: 'generating', message: 'Generating response stream...' });

    // AbortController propagation for client disconnect cancellation
    const abortController = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    // ── Step 6: Stream LLM Tokens ─────────────────────────────────────────────
    const streamGenerator = generateLLMResponseStream(prompt, abortController.signal, streamId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let llmResult: any;
    let backendChunkCount = 0;

    while (true) {
      const { value, done } = await streamGenerator.next();
      if (done) {
        llmResult = value;
        break;
      }
      backendChunkCount++;
      const writeStart = Date.now() - streamStart;
      sendSSEEvent(res, 'token', { delta: value });
      const writeEnd = Date.now() - streamStart;
      console.log(`[STREAM ${streamId}] BACKEND_WRITE #${backendChunkCount} t=${writeStart}ms..${writeEnd}ms size=${value.length}`);
    }

    // ── Step 7: Store assistant message ───────────────────────────────────────
    await storeMessage({
      conversationId: convId,
      userId,
      role: 'assistant',
      content: llmResult.answer,
      tokensUsed: llmResult.tokensUsed,
      latencyMs: llmResult.latencyMs,
      chunksRetrieved: chunks.length,
    });

    // ── Step 8: Finalize Stream ───────────────────────────────────────────────
    sendSSEEvent(res, 'done', {
      conversationId: convId,
      tokensUsed: llmResult.tokensUsed,
      latencyMs: llmResult.latencyMs,
      chunksRetrieved: chunks.length,
      model: llmResult.model,
    });
    res.end();
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Error generating response.';
    sendSSEEvent(res, 'error', { message: errMsg });
    res.end();
  }
};

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

// ─── DELETE /chat/conversations/:id ──────────────────────────────────────────

export const deleteConversationHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized.', 401);

  const id = req.params['id'] as string;
  const deleted = await deleteConversation(id, req.user.userId);

  if (!deleted) {
    res.status(404).json({ success: false, message: 'Conversation not found.' });
    return;
  }

  res.json({ success: true, message: 'Conversation deleted successfully.' });
});
