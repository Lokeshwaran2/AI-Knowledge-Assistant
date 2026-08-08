import { Router, Request, Response } from 'express';
import { checkDbConnection } from '../db/connection';
import { checkVectorDbHealth } from '../services/vectordb.service';

const router = Router();

// GET /health — production health check endpoint
router.get('/', async (_req: Request, res: Response) => {
  const [dbOk, vectorOk] = await Promise.all([
    checkDbConnection(),
    checkVectorDbHealth(),
  ]);

  const allHealthy = dbOk && vectorOk;

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbOk ? 'up (PostgreSQL Cloud)' : 'down',
      vectorDb: vectorOk ? 'up' : 'down',
      llm: 'groq-api',
      embeddings: 'local-xenova',
    },
  });
});

export default router;
