// Vector DB Service — ChromaDB with Embedded File Store Fallback
// Connects to ChromaDB if running on CHROMA_URL (http://localhost:8000)
// Automatically falls back to embedded vector store if ChromaDB is offline

import fs from 'fs';
import path from 'path';
import { ChromaClient, Collection } from 'chromadb';
import { AI_CONFIG } from '../config/ai.config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChunkMetadata {
  documentId: string;
  userId: string;
  chunkIndex: number;
  source: string;
}

export interface StoredChunk {
  id: string;
  embedding: number[];
  text: string;
  metadata: ChunkMetadata;
}

export interface RetrievedChunk {
  text: string;
  score: number; // Cosine similarity (higher = more relevant, 0–1)
  metadata: ChunkMetadata;
}

// ─── Fallback Local Store ──────────────────────────────────────────────────────

const STORE_PATH = path.resolve('./vector_store.json');

function loadLocalStore(): StoredChunk[] {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    return JSON.parse(raw) as StoredChunk[];
  } catch {
    return [];
  }
}

function saveLocalStore(chunks: StoredChunk[]): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify(chunks), 'utf-8');
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── ChromaDB Client ──────────────────────────────────────────────────────────

const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
let chromaClient: ChromaClient | null = null;
let chromaCollection: Collection | null = null;
let isChromaAvailable = false;

async function getChromaCollection(): Promise<Collection | null> {
  try {
    if (!chromaClient) {
      chromaClient = new ChromaClient({ path: chromaUrl });
    }
    await chromaClient.heartbeat();
    if (!chromaCollection) {
      chromaCollection = await chromaClient.getOrCreateCollection({
        name: AI_CONFIG.chromaCollection || 'rag_documents',
        metadata: { description: 'RAG document chunks' },
      });
    }
    isChromaAvailable = true;
    return chromaCollection;
  } catch {
    isChromaAvailable = false;
    return null;
  }
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkVectorDbHealth(): Promise<boolean> {
  const col = await getChromaCollection();
  return col !== null || true; // Always healthy via fallback
}

// ─── Store Chunks ─────────────────────────────────────────────────────────────

export async function storeChunks(
  chunks: string[],
  embeddings: number[][],
  metadata: ChunkMetadata[]
): Promise<void> {
  if (chunks.length === 0) return;

  const col = await getChromaCollection();

  if (col) {
    try {
      const ids = metadata.map((m) => `${m.documentId}_chunk_${m.chunkIndex}`);
      const metadatas = metadata.map((m) => ({ ...m }));

      await col.add({
        ids,
        embeddings,
        documents: chunks,
        metadatas,
      });
      console.log(`[ChromaDB] Stored ${chunks.length} chunks`);
      return;
    } catch (err) {
      console.warn('[ChromaDB] Failed to store chunks, using local fallback:', err);
    }
  }

  // Fallback to local JSON store
  const store = loadLocalStore();
  const newChunks: StoredChunk[] = chunks.map((text, i) => ({
    id: `${metadata[i].documentId}_chunk_${metadata[i].chunkIndex}`,
    embedding: embeddings[i],
    text,
    metadata: metadata[i],
  }));

  const docId = metadata[0].documentId;
  const filtered = store.filter((c) => c.metadata.documentId !== docId);

  saveLocalStore([...filtered, ...newChunks]);
  console.log(`[VectorStore] Stored ${newChunks.length} chunks locally`);
}

// ─── Similarity Search ────────────────────────────────────────────────────────

export async function similaritySearch(
  queryEmbedding: number[],
  userId: string,
  topK: number = AI_CONFIG.topK
): Promise<RetrievedChunk[]> {
  const col = await getChromaCollection();

  if (col) {
    try {
      const results = await col.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK,
        where: { userId },
      });

      if (results.documents[0] && results.documents[0].length > 0) {
        return results.documents[0].map((doc, i) => {
          const dist = results.distances ? (results.distances[0][i] ?? 1) : 1;
          // Convert Chroma cosine distance (0=identical, 2=opposite) to similarity (0-1)
          const similarity = Math.max(0, 1 - dist / 2);
          return {
            text: doc || '',
            score: similarity,
            metadata: (results.metadatas?.[0]?.[i] as unknown as ChunkMetadata) || ({} as ChunkMetadata),
          };
        });
      }
    } catch (err) {
      console.warn('[ChromaDB] Query failed, falling back to local store:', err);
    }
  }

  // Fallback to local JSON store
  const store = loadLocalStore();
  if (store.length === 0) return [];

  const userChunks = store.filter((c) => c.metadata.userId === userId);
  if (userChunks.length === 0) return [];

  const scored = userChunks.map((chunk) => ({
    text: chunk.text,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
    metadata: chunk.metadata,
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// ─── Delete Chunks ────────────────────────────────────────────────────────────

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  const col = await getChromaCollection();
  if (col) {
    try {
      await col.delete({ where: { documentId } });
    } catch {
      // ignore
    }
  }
  const store = loadLocalStore();
  const filtered = store.filter((c) => c.metadata.documentId !== documentId);
  saveLocalStore(filtered);
}
