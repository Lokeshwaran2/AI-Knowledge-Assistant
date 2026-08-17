// LLM Service — Groq API wrapper with observability + safety
// Responsibilities: call LLM, timeout guard, token tracking, latency measurement

import Groq from 'groq-sdk';
import { AI_CONFIG } from '../config/ai.config';
import { AppError } from '../utils/errors';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LLMResult {
  answer: string;
  tokensUsed: number;
  latencyMs: number;
  model: string;
}

// ─── Groq Client (singleton) ──────────────────────────────────────────────────

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    if (!process.env.GROQ_API_KEY) {
      throw new AppError('GROQ_API_KEY is not configured.', 500);
    }
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

function isModelUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const obj = err as {
    status?: number;
    error?: { error?: { code?: string; message?: string } };
    message?: string;
  };

  const code = obj.error?.error?.code;
  const msg = (obj.error?.error?.message || obj.message || '').toLowerCase();
  const status = obj.status;

  if (
    status === 404 ||
    status === 400 ||
    code === 'model_not_found' ||
    code === 'model_decommissioned'
  ) {
    if (
      code === 'model_not_found' ||
      code === 'model_decommissioned' ||
      msg.includes('decommissioned') ||
      msg.includes('does not exist') ||
      msg.includes('no longer supported') ||
      msg.includes('not found') ||
      msg.includes('access to it')
    ) {
      return true;
    }
  }

  return false;
}

// ─── Generate Response ────────────────────────────────────────────────────────

/**
 * Call Groq LLM with the grounded prompt.
 * Returns answer + observability metadata (tokens, latency, model).
 */
export async function generateLLMResponse(prompt: string): Promise<LLMResult> {
  const client = getGroqClient();
  const startTime = Date.now();
  const candidates = Array.from(
    new Set([AI_CONFIG.model, ...AI_CONFIG.fallbackModels])
  );

  let lastError: unknown = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    try {
      const completion = await Promise.race([
        client.chat.completions.create({
          model: candidate,
          messages: [{ role: 'user', content: prompt }],
          temperature: AI_CONFIG.temperature,
          max_tokens: AI_CONFIG.maxTokens,
        }),
        // Timeout guard — prevents hanging requests
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM_TIMEOUT')), AI_CONFIG.timeoutMs)
        ),
      ]);

      const latencyMs = Date.now() - startTime;
      const choice = completion.choices[0];

      if (!choice?.message?.content) {
        throw new AppError('LLM returned an empty response.', 502);
      }

      return {
        answer: choice.message.content.trim(),
        tokensUsed: completion.usage?.total_tokens ?? 0,
        latencyMs,
        model: candidate,
      };
    } catch (err: unknown) {
      lastError = err;
      if (isModelUnavailableError(err) && i < candidates.length - 1) {
        console.warn(
          `[LLM] Model '${candidate}' unavailable on Groq API. Trying fallback '${candidates[i + 1]}'...`
        );
        continue;
      }

      const latencyMs = Date.now() - startTime;

      if (err instanceof Error && err.message === 'LLM_TIMEOUT') {
        throw new AppError(
          `LLM response timed out after ${AI_CONFIG.timeoutMs / 1000}s. Please try again.`,
          504
        );
      }

      console.error(`[LLM] Error after ${latencyMs}ms:`, err);
      throw new AppError('Unable to generate a response. Please try again.', 502);
    }
  }

  throw lastError || new AppError('Unable to generate a response.', 502);
}

export interface StreamChunk {
  delta: string;
}

export async function* generateLLMResponseStream(
  prompt: string,
  abortSignal?: AbortSignal,
  streamId: string = 'local-stream'
): AsyncGenerator<string, LLMResult, void> {
  const client = getGroqClient();
  const startTime = Date.now();
  let fullText = '';
  let estimatedTokens = 0;
  let chunkCount = 0;

  console.log(`[STREAM ${streamId}] LLM_STREAM_START t=0ms`);

  const candidates = Array.from(
    new Set([AI_CONFIG.model, ...AI_CONFIG.fallbackModels])
  );

  let chosenModel = candidates[0];
  let lastError: unknown = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    chosenModel = candidate;

    try {
      const stream = await client.chat.completions.create(
        {
          model: candidate,
          messages: [{ role: 'user', content: prompt }],
          temperature: AI_CONFIG.temperature,
          max_tokens: AI_CONFIG.maxTokens,
          stream: true,
        },
        { signal: abortSignal }
      );

      for await (const chunk of stream) {
        if (abortSignal?.aborted) {
          break;
        }

        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          chunkCount++;
          const elapsed = Date.now() - startTime;
          console.log(`[STREAM ${streamId}] LLM_CHUNK_RECEIVED #${chunkCount} t=${elapsed}ms size=${content.length}`);
          fullText += content;
          estimatedTokens += 1;
          yield content;
        }
      }

      if (candidate !== AI_CONFIG.model) {
        console.warn(`[LLM] Fallback model '${candidate}' completed successfully.`);
      }

      const latencyMs = Date.now() - startTime;
      console.log(`[STREAM ${streamId}] LLM_STREAM_END t=${latencyMs}ms totalChunks=${chunkCount}`);
      return {
        answer: fullText.trim(),
        tokensUsed: estimatedTokens,
        latencyMs,
        model: chosenModel,
      };
    } catch (err: unknown) {
      lastError = err;
      if (err instanceof Error && err.name === 'AbortError') {
        const latencyMs = Date.now() - startTime;
        console.log(`[LLM] Streaming request aborted by client after ${latencyMs}ms`);
        return {
          answer: fullText.trim(),
          tokensUsed: estimatedTokens,
          latencyMs,
          model: chosenModel,
        };
      }

      if (chunkCount === 0 && isModelUnavailableError(err) && i < candidates.length - 1) {
        console.warn(
          `[LLM] Model '${candidate}' unavailable during stream initialization. Trying fallback '${candidates[i + 1]}'...`
        );
        continue;
      }

      console.error('[LLM] Streaming error:', err);
      throw new AppError('Unable to generate a response stream. Please try again.', 502);
    }
  }

  throw lastError || new AppError('Unable to generate a response stream.', 502);
}


