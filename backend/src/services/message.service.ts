// Message Service — persists conversation messages with observability metadata

import { pool } from '../db/connection';
import { v4 as uuidv4 } from 'uuid';

export interface StoreMessageData {
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  tokensUsed?: number;
  latencyMs?: number;
  chunksRetrieved?: number;
}

/**
 * Store a message with full observability metadata.
 * Tokens + latency tracked at message level for cost analytics.
 */
export async function storeMessage(data: StoreMessageData): Promise<void> {
  const {
    conversationId,
    userId,
    role,
    content,
    tokensUsed = 0,
    latencyMs = 0,
    chunksRetrieved = 0,
  } = data;

  await pool.query(
    `INSERT INTO messages (id, conversation_id, user_id, role, content, tokens_used, latency_ms, chunks_retrieved)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [uuidv4(), conversationId, userId, role, content, tokensUsed, latencyMs, chunksRetrieved]
  );

  // Touch conversation updated_at for last_accessed_at tracking
  await pool.query(
    'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
    [conversationId]
  );
}

/**
 * Create a new conversation and return its ID.
 */
export async function createConversation(userId: string, title?: string): Promise<string> {
  const id = uuidv4();
  await pool.query(
    'INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)',
    [id, userId, title || 'New Conversation']
  );
  return id;
}

/**
 * Delete a conversation and all its messages (ON DELETE CASCADE)
 */
export async function deleteConversation(conversationId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
    [conversationId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get conversation history (recent messages first, limited for context window management)
 */
export async function getConversationMessages(conversationId: string, limit = 20) {
  const result = await pool.query(
    `SELECT role, content, tokens_used, latency_ms, chunks_retrieved, created_at
     FROM messages WHERE conversation_id = $1
     ORDER BY created_at ASC LIMIT $2`,
    [conversationId, limit]
  );
  return result.rows;
}

/**
 * Get all conversations for a user with last_accessed_at
 */
export async function getUserConversations(userId: string) {
  const result = await pool.query(
    `SELECT c.id, c.title, c.created_at, c.updated_at,
            COUNT(m.id) as message_count,
            COALESCE(SUM(m.tokens_used), 0) as total_tokens,
            COALESCE(MAX(m.created_at), c.updated_at, c.created_at) as last_accessed_at
     FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id
     ORDER BY COALESCE(MAX(m.created_at), c.updated_at, c.created_at) DESC`,
    [userId]
  );
  return result.rows;
}
