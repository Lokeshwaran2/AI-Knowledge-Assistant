// Chunking Service — converts raw text into semantically meaningful chunks
// Strategy: fixed-size token windows with overlap + sentence-boundary respect

import { estimateTokens } from '../utils/tokenCounter';
import { AI_CONFIG } from '../config/ai.config';

/**
 * Split text into chunks suitable for embedding and retrieval.
 *
 * Strategy:
 * - Target chunk size: ~400 tokens
 * - Overlap: ~40 tokens (~10%) for context continuity
 * - Respect sentence boundaries to preserve semantic meaning
 * - Filter out empty/noise chunks
 */
export function chunkText(text: string): string[] {
  // Normalize whitespace
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (!normalized) return [];

  // Split into sentences (simple but effective heuristic)
  const sentences = splitIntoSentences(normalized);

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokenCount = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);

    // If single sentence exceeds chunk size, force-split it
    if (sentenceTokens > AI_CONFIG.chunkSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
        currentChunk = [];
        currentTokenCount = 0;
      }
      const forcedChunks = forceChunk(sentence);
      chunks.push(...forcedChunks);
      continue;
    }

    // If adding this sentence would exceed the chunk size, finalize current chunk
    if (currentTokenCount + sentenceTokens > AI_CONFIG.chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));

      // Build overlap: keep the last few sentences for context continuity
      const overlapSentences = getOverlapSentences(currentChunk);
      currentChunk = overlapSentences;
      currentTokenCount = overlapSentences.reduce((sum, s) => sum + estimateTokens(s), 0);
    }

    currentChunk.push(sentence);
    currentTokenCount += sentenceTokens;
  }

  // Push remaining content
  if (currentChunk.length > 0 && currentChunk.join(' ').trim()) {
    chunks.push(currentChunk.join(' '));
  }

  // Filter noise chunks (too short to be meaningful)
  return chunks.filter((chunk) => chunk.trim().length > 50);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function getOverlapSentences(sentences: string[]): string[] {
  // Take enough trailing sentences to fill the overlap budget
  const overlapTarget = AI_CONFIG.chunkOverlap;
  const overlap: string[] = [];
  let tokenCount = 0;

  for (let i = sentences.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(sentences[i]);
    if (tokenCount + tokens > overlapTarget) break;
    overlap.unshift(sentences[i]);
    tokenCount += tokens;
  }

  return overlap;
}

function forceChunk(text: string): string[] {
  // Force-split oversized text by character count (~4 chars/token)
  const maxChars = AI_CONFIG.chunkSize * 4;
  const chunks: string[] = [];

  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push(text.slice(i, i + maxChars).trim());
  }

  return chunks.filter((c) => c.length > 50);
}
