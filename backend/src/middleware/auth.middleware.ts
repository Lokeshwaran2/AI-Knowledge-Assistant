import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { SERVER_CONFIG } from '../config/server.config';

// ─── Extend Express Request with user context ─────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
      };
    }
  }
}

// ─── JWT Verification Middleware ──────────────────────────────────────────────

export const verifyJWT = (req: Request, res: Response, next: NextFunction): void => {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && typeof req.query['token'] === 'string') {
    token = req.query['token'];
  }

  if (!token) {
    res.status(401).json({ success: false, message: 'Authorization token required.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, SERVER_CONFIG.jwtSecret) as {
      userId: string;
      email: string;
    };

    req.user = { userId: decoded.userId, email: decoded.email };
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};
