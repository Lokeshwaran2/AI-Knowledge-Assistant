// Token counting utility using tiktoken
// Used for tracking LLM costs at message level

let encoder: { encode: (text: string) => Uint32Array; free: () => void } | null = null;

async function getEncoder() {
  if (!encoder) {
    const tiktoken = await import('tiktoken');
    encoder = tiktoken.encoding_for_model('gpt2'); // gpt2 tokenizer is close enough for llama
  }
  return encoder;
}

/**
 * Count tokens in a text string
 * Uses gpt2 tokenizer as a close approximation for llama models
 */
export async function countTokens(text: string): Promise<number> {
  try {
    const enc = await getEncoder();
    const tokens = enc.encode(text);
    return tokens.length;
  } catch {
    // Fallback: approximate by word count * 1.3
    return Math.ceil(text.split(/\s+/).length * 1.3);
  }
}

/**
 * Estimate tokens without async — for chunking logic
 */
export function estimateTokens(text: string): number {
  // ~4 chars per token is a good approximation
  return Math.ceil(text.length / 4);
}
