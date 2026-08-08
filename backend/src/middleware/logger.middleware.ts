import { Request, Response, NextFunction } from 'express';

/**
 * Request logger middleware — logs method, path, status, and latency
 * Gives instant observability for every API call
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  res.on('finish', () => {
    const latencyMs = Date.now() - startTime;
    const { method, originalUrl } = req;
    const { statusCode } = res;

    const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(`[${level}] ${method} ${originalUrl} → ${statusCode} (${latencyMs}ms)`);
  });

  next();
};
