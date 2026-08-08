// Prompt Service — converts retrieved chunks into a grounded prompt
// Isolates prompt construction logic for easy versioning and A/B testing

import { RetrievedChunk } from './vectordb.service';
import { buildAnswerPromptV1 } from '../prompts/answer_prompt_v1';

/**
 * Build the final prompt for the LLM from a question and retrieved chunks.
 * Uses v1 prompt template — swap to v2 here when iterating.
 */
export function buildAnswerPrompt(question: string, chunks: RetrievedChunk[]): string {
  const chunkTexts = chunks.map((c) => c.text);
  return buildAnswerPromptV1(question, chunkTexts);
}

/**
 * Build a "no context" prompt when retrieval returns no results.
 * Forces deterministic refusal without sending empty context to LLM.
 */
export function buildNoContextResponse(): string {
  return 'Not available in the provided context.';
}
