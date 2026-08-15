// SSE Service — Server-Sent Events real-time progress notification manager
// Purpose: Streams live ingestion progress (extraction, chunking, embedding) directly to client browser over a persistent HTTP connection

import { Response } from 'express';

export interface ProgressEventPayload {
  documentId: string;
  status: 'processing' | 'ready' | 'failed';
  stage: 'extraction' | 'chunking' | 'embedding' | 'storing' | 'completed' | 'failed';
  progress: number; // 0 to 100 percentage
  message: string;
  chunkCount?: number;
}

interface ActiveSSEConnection {
  userId: string;
  res: Response;
}

class SSEService {
  private connections: Set<ActiveSSEConnection> = new Set();

  /**
   * Register a new client SSE connection for real-time progress streaming
   */
  registerConnection(userId: string, res: Response): void {
    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx/Cloudflare proxy buffering
    res.flushHeaders();

    // Send initial handshake connection event
    res.write(`event: handshake\ndata: ${JSON.stringify({ connected: true, timestamp: Date.now() })}\n\n`);

    const connection: ActiveSSEConnection = { userId, res };
    this.connections.add(connection);

    // Keep connection alive with periodic heartbeat ping every 20 seconds
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 20000);

    // Clean up when client disconnects
    res.on('close', () => {
      clearInterval(heartbeat);
      this.connections.delete(connection);
    });
  }

  /**
   * Broadcast real-time ingestion progress to a specific authenticated user
   */
  emitProgress(userId: string, payload: ProgressEventPayload): void {
    const dataString = `event: progress\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const conn of this.connections) {
      if (conn.userId === userId) {
        try {
          conn.res.write(dataString);
        } catch (err) {
          console.warn('[SSE] Failed to write event to user connection:', err);
        }
      }
    }
  }
}

export const sseService = new SSEService();
