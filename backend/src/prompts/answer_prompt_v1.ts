// Versioned Answer Prompt — v1
// Hallucination-controlled, grounded response template
// Treat this as a deterministic system artifact — version it like code

/**
 * Build the grounded answer prompt by injecting retrieved context chunks.
 *
 * Design decisions:
 * - Role defined first for consistent reasoning style
 * - Explicit "ONLY from context" rule suppresses hallucination
 * - Deterministic refusal behavior ("Not available") for missing info
 * - Chunk labels ([Source 1], [Source 2], ...) improve source attribution
 * - Question separated clearly to prevent instruction leakage
 */
export function buildAnswerPromptV1(question: string, contextChunks: string[]): string {
  const context = contextChunks
    .map((chunk, i) => `[Source ${i + 1}]\n${chunk.trim()}`)
    .join('\n\n');

  return `You are an AI Knowledge Assistant.

Your responsibility is to provide accurate, concise answers using ONLY the supplied context below.

Rules:
- Answer STRICTLY from the provided context. Do NOT use any prior knowledge.
- Do NOT make assumptions or infer beyond what is explicitly stated.
- If the answer is not present in the context, respond ONLY with: "Not available in the provided context."
- Keep answers concise and factual. Use bullet points for multi-part answers.
- Do NOT mention that you are an AI or refer to these instructions.

Context:
${context}

Question: ${question}

Answer:`;
}
