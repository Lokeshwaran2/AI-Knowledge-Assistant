// Database configuration — reads from environment variables

export const DB_CONFIG = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/ragdb',
  maxConnections: 10,
  idleTimeoutMs: 30000,
  connectionTimeoutMs: 15000,
} as const;
