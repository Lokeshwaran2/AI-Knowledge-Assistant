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

// ─── Generate Response ────────────────────────────────────────────────────────

/**
 * Call Groq LLM with the grounded prompt.
 * Returns answer + observability metadata (tokens, latency, model).
 */
export async function generateLLMResponse(prompt: string): Promise<LLMResult> {
  const client = getGroqClient();
  const startTime = Date.now();

  try {
    const completion = await Promise.race([
      client.chat.completions.create({
        model: AI_CONFIG.model,
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
      model: AI_CONFIG.model,
    };
  } catch (err) {
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

  try {
    const stream = await client.chat.completions.create(
      {
        model: AI_CONFIG.model,
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

    const latencyMs = Date.now() - startTime;
    console.log(`[STREAM ${streamId}] LLM_STREAM_END t=${latencyMs}ms totalChunks=${chunkCount}`);
    return {
      answer: fullText.trim(),
      tokensUsed: estimatedTokens,
      latencyMs,
      model: AI_CONFIG.model,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      const latencyMs = Date.now() - startTime;
      console.log(`[LLM] Streaming request aborted by client after ${latencyMs}ms`);
      return {
        answer: fullText.trim(),
        tokensUsed: estimatedTokens,
        latencyMs,
        model: AI_CONFIG.model,
      };
    }
    console.error('[LLM] Streaming error:', err);
    throw new AppError('Unable to generate a response stream. Please try again.', 502);
  }
}
