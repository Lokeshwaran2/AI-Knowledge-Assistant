import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/connection';
import { AppError } from '../utils/errors';
import { SERVER_CONFIG } from '../config/server.config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthPayload {
  userId: string;
  email: string;
}

export interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
  };
}

// ─── Register ─────────────────────────────────────────────────────────────────

export async function registerUser(email: string, password: string): Promise<AuthResult> {
  // Check if user already exists
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new AppError('An account with this email already exists.', 409);
  }

  // Hash password with bcrypt (cost factor 12 for production security)
  const passwordHash = await bcrypt.hash(password, 12);

  const userId = uuidv4();

  // Insert user
  const result = await pool.query(
    'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email',
    [userId, email, passwordHash]
  );

  const user = result.rows[0] as { id: string; email: string };
  const token = signToken({ userId: user.id, email: user.email });

  return { token, user: { id: user.id, email: user.email } };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  // Fetch user
  const result = await pool.query(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    // Use generic message to prevent user enumeration attacks
    throw new AppError('Invalid email or password.', 401);
  }

  const user = result.rows[0] as { id: string; email: string; password_hash: string };

  // Verify password
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new AppError('Invalid email or password.', 401);
  }

  const token = signToken({ userId: user.id, email: user.email });

  return { token, user: { id: user.id, email: user.email } };
}

// ─── Token Signing ────────────────────────────────────────────────────────────

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, SERVER_CONFIG.jwtSecret, {
    expiresIn: SERVER_CONFIG.jwtExpiresIn as string,
  } as jwt.SignOptions);
}
