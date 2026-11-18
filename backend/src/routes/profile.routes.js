import express from 'express';
import { all, one, run } from '../db/index.js';
import { AppError, asyncHandler } from '../lib/errors.js';
import { serializeUser } from '../lib/serializers.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveDiary } from '../middleware/diary.js';
import { profileLimiter } from '../middleware/rateLimits.js';
import { avatarUpload, detectImageMime, MAX_AVATAR_BYTES } from '../middleware/upload.js';
import { recordActivity } from '../services/activity.js';
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

function parseSongText(rawValue, label) {
  const value = String(rawValue ?? '')
    .trim()
    .replace(/\s+/g, ' ');

  if (!value) return null;

  if (value.length > MAX_SONG_TITLE_LENGTH) {
    throw new AppError(400, `${label} é longo demais.`);
  }

  return value;
}

function parseTrackId(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return rawValue;
  if (typeof rawValue === 'string' && rawValue.trim().length <= MAX_SONG_TITLE_LENGTH) {
    return rawValue.trim() || null;
  }
  throw new AppError(400, 'Identificador da música inválido.');
}

function validateSongTimes(start, end) {
  if (
    typeof start !== 'number' || !Number.isFinite(start) ||
    typeof end !== 'number' || !Number.isFinite(end) ||
    start < 0 || start >= end || end > 30
  ) {
    throw new AppError(400, 'O trecho deve ter tempos numéricos com 0 ≤ início < fim ≤ 30 segundos.');
  }
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
    `SELECT id, name, email, avatar_data, profile_song_audio_url, profile_song_cover_url,
            profile_song_title, profile_song_track_id, profile_song_artist_name,
            profile_song_start_time, profile_song_end_time, created_at
       FROM users
      WHERE id = ?`,
    [userId],
  );
}

async function loadPublicUser(userId) {
  return one(
    `SELECT id, name, avatar_data, profile_song_audio_url, profile_song_cover_url,
            profile_song_title, profile_song_track_id, profile_song_artist_name,
            profile_song_start_time, profile_song_end_time, created_at
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
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
    const songFields = [
      ['profileSongAudioUrl', 'profile_song_audio_url', (value) => parseSongUrl(value, 'áudio da música')],
      ['profileSongCoverUrl', 'profile_song_cover_url', (value) => parseSongUrl(value, 'capa da música')],
      ['profileSongTitle', 'profile_song_title', (value) => parseSongText(value, 'O título da música')],
      ['profileSongTrackId', 'profile_song_track_id', parseTrackId],
      ['profileSongArtistName', 'profile_song_artist_name', (value) => parseSongText(value, 'O nome do artista')],
    ];
    const hasStart = has('profileSongStartTime');
    const hasEnd = has('profileSongEndTime');

    if (!has('name') && !songFields.some(([key]) => has(key)) && !hasStart && !hasEnd) {
      throw new AppError(400, 'Nada para atualizar no perfil.');
    }

    const fields = [];
    const values = [];

    if (has('name')) {
      const name = String(body.name ?? '')
        .trim()
        .replace(/\s+/g, ' ');

      if (name.length < 2 || name.length > 60) {
        throw new AppError(400, 'Informe um nome entre 2 e 60 caracteres.');
      }

      fields.push('name = ?');
      values.push(name);
    }

    const songValues = new Map();
    for (const [key, column, parse] of songFields) {
      if (has(key)) songValues.set(column, parse(body[key]));
    }

    const start = hasStart ? body.profileSongStartTime : (req.user.profile_song_start_time ?? 0);
    const end = hasEnd ? body.profileSongEndTime : (req.user.profile_song_end_time ?? 30);
    if (hasStart || hasEnd) validateSongTimes(start, end);

    const removingSong = has('profileSongAudioUrl') && songValues.get('profile_song_audio_url') === null;
    if (removingSong) {
      for (const [, column] of songFields) songValues.set(column, null);
      songValues.set('profile_song_start_time', 0);
      songValues.set('profile_song_end_time', 30);
    } else {
      if (hasStart) songValues.set('profile_song_start_time', start);
      if (hasEnd) songValues.set('profile_song_end_time', end);
    }

    for (const [column, value] of songValues) {
      fields.push(`${column} = ?`);
      values.push(value);
    }

    values.push(req.user.id);
    let timeGuard = '';
    if ((hasStart || hasEnd) && !removingSong) {
      // Valida também contra o valor atual no banco, caso outra requisição o tenha alterado.
      timeGuard = ` AND COALESCE(?, profile_song_start_time, 0) >= 0
                    AND COALESCE(?, profile_song_start_time, 0) < COALESCE(?, profile_song_end_time, 30)
                    AND COALESCE(?, profile_song_end_time, 30) <= 30`;
      values.push(hasStart ? start : null, hasStart ? start : null, hasEnd ? end : null, hasEnd ? end : null);
    }
    const result = await run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?${timeGuard}`, values);
    if (result.rowsAffected === 0 && timeGuard) {
      throw new AppError(400, 'O trecho deve ter tempos numéricos com 0 ≤ início < fim ≤ 30 segundos.');
    }

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
  requireActiveDiary,
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

    await recordActivity({
      diary: req.diary,
      userId: req.user.id,
      actionType: 'favorited',
      movieTitle: movie.title,
      movieId,
    });

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
