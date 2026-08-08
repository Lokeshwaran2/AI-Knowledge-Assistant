// AI Configuration — centralized model settings
// Change model/params here to affect entire system

export const AI_CONFIG = {
  // Groq LLM settings
  model: 'llama-3.3-70b-versatile',
  temperature: 0.2,        // Low = deterministic, grounded responses
  maxTokens: 512,          // Cost control — cap response length
  timeoutMs: 30000,        // 30s LLM timeout guard

  // Embedding settings (local @xenova/transformers)
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  embeddingDimension: 384, // all-MiniLM-L6-v2 output dimension

  // Retrieval settings
  topK: 5,                 // Number of chunks to retrieve
  similarityThreshold: 0.3, // Min cosine similarity to accept a chunk (0=unrelated, 1=identical)

  // Chunking settings
  chunkSize: 400,          // Target tokens per chunk
  chunkOverlap: 40,        // ~10% overlap for context continuity

  // Vector Store Settings
  vectorStorePath: './vector_store.json',
  chromaCollection: 'rag_documents',
} as const;
