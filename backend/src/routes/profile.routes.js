import express from 'express';
import { all, one, run } from '../db/index.js';
import { AppError, asyncHandler } from '../lib/errors.js';
import { serializeUser } from '../lib/serializers.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveDiary } from '../middleware/diary.js';
import { profileLimiter } from '../middleware/rateLimits.js';
import { avatarUpload, detectImageMime, MAX_AVATAR_BYTES } from '../middleware/upload.js';
import { ensureMovie, serializeMovie } from '../services/movies.js';

const router = express.Router();
const MAX_FAVORITES = 4;
const MAX_AVATAR_DATA_URL = 3 * 1024 * 1024;
const MAX_SONG_URL_LENGTH = 2048;
const MAX_SONG_TITLE_LENGTH = 200;

router.use(requireAuth);

function parseSongUrl(rawValue, label) {
  const value = String(rawValue ?? '').trim();

  if (!value) return null;

  if (value.length > MAX_SONG_URL_LENGTH) {
    throw new AppError(400, `O link de ${label} é longo demais.`);
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, `Informe um link válido para ${label}.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError(400, `Use um link http(s) para ${label}.`);
  }

  return value;
}

function parseSongTitle(rawValue) {
  const value = String(rawValue ?? '')
    .trim()
    .replace(/\s+/g, ' ');

  if (!value) return null;

  if (value.length > MAX_SONG_TITLE_LENGTH) {
    throw new AppError(400, 'O título da música é longo demais.');
  }

  return value;
}

function parseMovieId(rawId) {
  if (!/^\d+$/.test(String(rawId))) {
    throw new AppError(400, 'Filme inválido.');
  }

  const movieId = Number(rawId);

  if (!Number.isSafeInteger(movieId) || movieId <= 0) {
    throw new AppError(400, 'Filme inválido.');
  }

  return movieId;
}

async function listFavorites(userId) {
  const rows = await all(
    `SELECT m.*
       FROM favorite_movies f
       JOIN movies m ON m.tmdb_id = f.movie_id
      WHERE f.user_id = ?
      ORDER BY f.created_at ASC, f.id ASC`,
    [userId],
  );

  return rows.map((row) => serializeMovie(row));
}

async function loadUser(userId) {
  return one(
    `SELECT id, name, email, avatar_data, profile_song_audio_url, profile_song_cover_url, profile_song_title, created_at
       FROM users
      WHERE id = ?`,
    [userId],
  );
}

async function loadPublicUser(userId) {
  return one(
    `SELECT id, name, avatar_data, profile_song_audio_url, profile_song_cover_url, profile_song_title, created_at
       FROM users
      WHERE id = ?`,
    [userId],
  );
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({
      user: serializeUser(req.user),
      favorites: await listFavorites(req.user.id),
    });
  }),
);

router.patch(
  '/',
  profileLimiter,
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name ?? '')
      .trim()
      .replace(/\s+/g, ' ');

    if (name.length < 2 || name.length > 60) {
      throw new AppError(400, 'Informe um nome entre 2 e 60 caracteres.');
    }

    await run('UPDATE users SET name = ? WHERE id = ?', [name, req.user.id]);
    const user = await loadUser(req.user.id);

    res.json({ user: serializeUser(user) });
  }),
);

router.put(
  '/',
  profileLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
    const hasAudio = Object.prototype.hasOwnProperty.call(body, 'profileSongAudioUrl');
    const hasCover = Object.prototype.hasOwnProperty.call(body, 'profileSongCoverUrl');
    const hasTitle = Object.prototype.hasOwnProperty.call(body, 'profileSongTitle');

    if (!hasName && !hasAudio && !hasCover && !hasTitle) {
      throw new AppError(400, 'Nada para atualizar no perfil.');
    }

    const fields = [];
    const values = [];

    if (hasName) {
      const name = String(body.name ?? '')
        .trim()
        .replace(/\s+/g, ' ');

      if (name.length < 2 || name.length > 60) {
        throw new AppError(400, 'Informe um nome entre 2 e 60 caracteres.');
      }

      fields.push('name = ?');
      values.push(name);
    }

    if (hasAudio) {
      fields.push('profile_song_audio_url = ?');
      values.push(parseSongUrl(body.profileSongAudioUrl, 'áudio da música'));
    }

    if (hasCover) {
      fields.push('profile_song_cover_url = ?');
      values.push(parseSongUrl(body.profileSongCoverUrl, 'capa da música'));
    }

    if (hasTitle) {
      fields.push('profile_song_title = ?');
      values.push(parseSongTitle(body.profileSongTitle));
    }

    values.push(req.user.id);
    await run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    const user = await loadUser(req.user.id);
    res.json({ user: serializeUser(user) });
  }),
);

router.post(
  '/avatar',
  profileLimiter,
  avatarUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError(400, 'Nenhuma imagem recebida.');
    }

    if (req.file.size > MAX_AVATAR_BYTES) {
      throw new AppError(413, 'A foto pode ter no máximo 2 MB.');
    }

    const mime = detectImageMime(req.file.buffer);

    if (!mime) {
      throw new AppError(400, 'Envie uma imagem PNG, JPG, WEBP ou GIF válida.');
    }

    const dataUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;

    if (dataUrl.length > MAX_AVATAR_DATA_URL) {
      throw new AppError(413, 'A foto é grande demais. Envie uma imagem menor.');
    }

    await run('UPDATE users SET avatar_data = ? WHERE id = ?', [dataUrl, req.user.id]);
    const user = await loadUser(req.user.id);

    res.json({ user: serializeUser(user), avatarUrl: user.avatar_data });
  }),
);

router.delete(
  '/avatar',
  profileLimiter,
  asyncHandler(async (req, res) => {
    await run('UPDATE users SET avatar_data = NULL WHERE id = ?', [req.user.id]);
    const user = await loadUser(req.user.id);

    res.json({ user: serializeUser(user), avatarUrl: null });
  }),
);

router.get(
  '/favorites',
  asyncHandler(async (req, res) => {
    res.json({ favorites: await listFavorites(req.user.id) });
  }),
);

router.post(
  '/favorites',
  asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.body?.movieId);
    const total = await one(
      'SELECT COUNT(*) AS total FROM favorite_movies WHERE user_id = ?',
      [req.user.id],
    );

    if (Number(total?.total || 0) >= MAX_FAVORITES) {
      throw new AppError(409, `Você pode escolher até ${MAX_FAVORITES} filmes favoritos.`);
    }

    const movie = await ensureMovie(movieId);

    try {
      await run('INSERT INTO favorite_movies (user_id, movie_id) VALUES (?, ?)', [
        req.user.id,
        movieId,
      ]);
    } catch (error) {
      const message = String(error?.message || '');

      if (message.includes('favorite_limit_reached')) {
        throw new AppError(409, `Você pode escolher até ${MAX_FAVORITES} filmes favoritos.`);
      }

      if (/unique|constraint/i.test(message)) {
        throw new AppError(409, 'Esse filme já está nos seus favoritos.');
      }

      throw error;
    }

    res.status(201).json({
      favorite: serializeMovie(movie),
      favorites: await listFavorites(req.user.id),
    });
  }),
);

router.delete(
  '/favorites/:movieId',
  asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.movieId);
    const result = await run(
      'DELETE FROM favorite_movies WHERE user_id = ? AND movie_id = ?',
      [req.user.id, movieId],
    );

    if (result.rowsAffected === 0) {
      throw new AppError(404, 'Esse filme não está nos seus favoritos.');
    }

    res.json({ ok: true });
  }),
);

router.get(
  '/:userId(\\d+)',
  requireActiveDiary,
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const isMember = [req.diary.user1_id, req.diary.user2_id].includes(userId);

    if (!Number.isSafeInteger(userId) || userId <= 0 || !isMember) {
      throw new AppError(403, 'Esse perfil não faz parte do seu diário.');
    }

    const user = await loadPublicUser(userId);

    if (!user) {
      throw new AppError(404, 'Perfil não encontrado.');
    }

    res.json({
      user: serializeUser(user, { includeEmail: false }),
      favorites: await listFavorites(userId),
      isSelf: userId === req.user.id,
    });
  }),
);

export default router;
