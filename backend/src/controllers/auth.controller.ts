import { Request, Response } from 'express';
import { registerUser, loginUser } from '../services/auth.service';
import { asyncHandler } from '../utils/errors';

// ─── Register ─────────────────────────────────────────────────────────────────

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email and password are required.' });
    return;
  }

  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    return;
  }

  const result = await registerUser(email.toLowerCase().trim(), password);

  res.status(201).json({ success: true, ...result });
});

// ─── Login ────────────────────────────────────────────────────────────────────

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email and password are required.' });
    return;
  }

  const result = await loginUser(email.toLowerCase().trim(), password);

  res.status(200).json({ success: true, ...result });
});
