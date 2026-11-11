import { config } from '../config.js';
import { one } from '../db/index.js';
import { AppError, asyncHandler } from '../lib/errors.js';
import { readSessionToken } from '../lib/session.js';

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[config.cookie.name];

  if (!token) {
    throw new AppError(401, 'Faça login para continuar.');
  }

  let userId;

  try {
    userId = readSessionToken(token);
  } catch {
    throw new AppError(401, 'Sua sessão expirou. Entre novamente.');
  }

  const user = await one(
    `SELECT id, name, email, avatar_data, profile_song_audio_url, profile_song_cover_url, profile_song_title, created_at
       FROM users
      WHERE id = ?`,
    [userId],
  );

  if (!user) {
    throw new AppError(401, 'Sua sessão não é mais válida. Entre novamente.');
  }

  req.user = user;
  next();
});
