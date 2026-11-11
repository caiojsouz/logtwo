import express from 'express';
import bcrypt from 'bcrypt';
import { one, run } from '../db/index.js';
import { AppError, asyncHandler } from '../lib/errors.js';
import { clearSessionCookie, setSessionCookie } from '../lib/session.js';
import { serializeDiary, serializeUser } from '../lib/serializers.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimits.js';
import { findDiaryForUser } from '../services/diaries.js';

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUniqueViolation(error) {
  return /unique|constraint/i.test(String(error?.message || ''));
}

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ');
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (name.length < 2 || name.length > 60) {
      throw new AppError(400, 'Informe um nome entre 2 e 60 caracteres.');
    }

    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      throw new AppError(400, 'Informe um e-mail válido.');
    }

    if (password.length < 8 || password.length > 72) {
      throw new AppError(400, 'A senha precisa ter entre 8 e 72 caracteres.');
    }

    const existing = await one('SELECT id FROM users WHERE email = ?', [email]);

    if (existing) {
      throw new AppError(409, 'Esse e-mail já está cadastrado. Tente entrar.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let result;

    try {
      result = await run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [
        name,
        email,
        passwordHash,
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'Esse e-mail já está cadastrado. Tente entrar.');
      }
      throw error;
    }

    const userId = Number(result.lastInsertRowid);
    const user = await one(
      `SELECT id, name, email, avatar_data, profile_song_audio_url, profile_song_cover_url, created_at
         FROM users
        WHERE id = ?`,
      [userId],
    );

    setSessionCookie(res, userId);

    res.status(201).json({ user: serializeUser(user), diary: null });
  }),
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      throw new AppError(400, 'Informe e-mail e senha.');
    }

    const user = await one('SELECT * FROM users WHERE email = ?', [email]);
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!user || !passwordMatches) {
      throw new AppError(401, 'E-mail ou senha incorretos.');
    }

    const diary = await findDiaryForUser(user.id);
    setSessionCookie(res, user.id);

    res.json({
      user: serializeUser(user),
      diary: serializeDiary(diary, user.id),
    });
  }),
);

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const diary = await findDiaryForUser(req.user.id);

    res.json({
      user: serializeUser(req.user),
      diary: serializeDiary(diary, req.user.id),
    });
  }),
);

export default router;
