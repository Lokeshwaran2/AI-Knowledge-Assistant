import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

/**
 * Request logger middleware — attaches correlation X-Request-ID header
 * and produces structured JSON logs in production for end-to-end traceability.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);

  const startTime = Date.now();

  res.on('finish', () => {
    const latencyMs = Date.now() - startTime;
    const { method, originalUrl } = req;
    const { statusCode } = res;
    const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';

    if (process.env.NODE_ENV === 'production') {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          requestId,
          level,
          method,
          url: originalUrl,
          status: statusCode,
          latencyMs,
          userId: req.user?.userId || null,
        })
      );
    } else {
      console.log(`[${level}] [${requestId.slice(0, 8)}] ${method} ${originalUrl} → ${statusCode} (${latencyMs}ms)`);
    }
  });

  next();
};
