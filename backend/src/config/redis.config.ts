// Redis Configuration — Upstash Redis connection setup for BullMQ job queue
// Handles URL parsing, TLS options for Upstash, and fallback state

export const REDIS_CONFIG = {
  url: process.env.REDIS_URL || '',
  isEnabled: Boolean(process.env.REDIS_URL),
} as const;

export function getRedisOptions() {
  if (!REDIS_CONFIG.url) {
    return { host: 'localhost', port: 6379 };
  }

  // Parse rediss:// or redis:// connection string (Upstash Redis support)
  const isTls = REDIS_CONFIG.url.startsWith('rediss://');
  const urlObj = new URL(REDIS_CONFIG.url);

  return {
    host: urlObj.hostname,
    port: parseInt(urlObj.port || '6379', 10),
    username: urlObj.username || undefined,
    password: urlObj.password || undefined,
    tls: isTls ? { rejectUnauthorized: false } : undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
  };
}
