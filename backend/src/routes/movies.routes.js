import express from 'express';
import { all, one, run } from '../db/index.js';
import { AppError, asyncHandler } from '../lib/errors.js';
import { serializeReview } from '../lib/serializers.js';
import { getTvDetails, getUpcomingMovies, getWatchProviders, imageUrl, searchMovies } from '../lib/tmdb.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveDiary } from '../middleware/diary.js';
import { searchLimiter } from '../middleware/rateLimits.js';
import { recordActivity } from '../services/activity.js';
import { getDiaryReviews } from '../services/diaries.js';
import {
  ensureMovie,
  ensureMovieProviders,
  getDiaryMovieIds,
  saveMovie,
  serializeMovie,
} from '../services/movies.js';

const router = express.Router();

const MAX_SONG_TITLE_LENGTH = 200;
const MAX_SONG_URL_LENGTH = 2048;

router.use(requireAuth, requireActiveDiary);

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

function parseWatchedAt(rawValue) {
  const raw = String(rawValue ?? '').trim();

  if (!raw) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AppError(400, 'Informe uma data válida para a sessão.');
  }

  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new AppError(400, 'Informe uma data válida para a sessão.');
  }

  return raw;
}

router.get(
  '/search',
  searchLimiter,
  asyncHandler(async (req, res) => {
    const query = String(req.query.q ?? '').trim();

    if (query.length < 2) {
      throw new AppError(400, 'Digite pelo menos 2 caracteres para buscar.');
    }

    if (query.length > 80) {
      throw new AppError(400, 'Busca muito longa.');
    }

    const [results, diaryMovieIds] = await Promise.all([
      searchMovies(query),
      getDiaryMovieIds(req.diary.id),
    ]);
    const inDiary = new Set(diaryMovieIds);

    res.json({
      results: results.map((movie) => ({ ...movie, inDiary: inDiary.has(movie.tmdbId) })),
    });
  }),
);

const UPCOMING_FEED_TTL_MS = 10 * 60 * 1000;
let upcomingFeedAt = 0;
let upcomingFeedPromise = null;

/**
 * O feed regional do TMDB é a fonte da data de estreia no Brasil. Ressincroniza
 * em segundo plano para recuperar datas que a ficha possa ter regredido.
 */
function refreshUpcomingFeed() {
  if (upcomingFeedPromise) return upcomingFeedPromise;
  if (Date.now() - upcomingFeedAt < UPCOMING_FEED_TTL_MS) return Promise.resolve();

  upcomingFeedPromise = (async () => {
    const upcoming = await getUpcomingMovies();
    await Promise.all(upcoming.map((movie) => saveMovie(movie)));
    upcomingFeedAt = Date.now();
  })()
    .catch((error) => {
      // Também marca o TTL para não bater no TMDB a cada requisição quando ele falha.
      upcomingFeedAt = Date.now();
      console.warn('[logtwo] Não foi possível atualizar os lançamentos do TMDB:', error?.message);
    })
    .finally(() => {
      upcomingFeedPromise = null;
    });

  return upcomingFeedPromise;
}

function selectUpcoming(userId) {
  return all(
    `SELECT m.*, CASE WHEN wi.id IS NULL THEN 0 ELSE 1 END AS interested
       FROM movies m
  LEFT JOIN watchlist_interests wi
         ON wi.movie_id = m.tmdb_id AND wi.user_id = ?
      WHERE m.release_date > date('now')
         OR wi.id IS NOT NULL
   ORDER BY (m.release_date > date('now')) DESC, m.release_date ASC
      LIMIT 24`,
    [userId],
  );
}

function serializeUpcoming(rows) {
  return rows.map((row) => ({ ...serializeMovie(row), interested: Boolean(row.interested) }));
}

router.get(
  '/upcoming',
  asyncHandler(async (req, res) => {
    await refreshUpcomingFeed();

    const rows = await selectUpcoming(req.user.id);

    res.json({ movies: serializeUpcoming(rows) });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.id);

    // Itens de série das listas abrem a ficha do TMDB, mas não entram no diário.
    if (req.query.mediaType === 'tv') {
      const details = await getTvDetails(movieId);
      const watch = await getWatchProviders(movieId, 'tv').catch(() => ({ providers: [] }));

      res.json({
        movie: {
          ...details,
          year: details.releaseDate ? details.releaseDate.slice(0, 4) : null,
          posterUrl: imageUrl(details.posterPath),
          backdropUrl: imageUrl(details.backdropPath, 'w1280'),
          songTitle: null,
          songAudioUrl: null,
          providers: watch.providers,
          reviews: [],
          interested: false,
        },
      });
      return;
    }

    const row = await ensureMovie(movieId);
    await ensureMovieProviders(row);
    const [reviews, interest] = await Promise.all([
      getDiaryReviews(req.diary.id, movieId),
      one('SELECT id FROM watchlist_interests WHERE user_id = ? AND movie_id = ?', [
        req.user.id,
        movieId,
      ]),
    ]);

    res.json({
      movie: {
        ...serializeMovie(row, reviews.map(serializeReview)),
        interested: Boolean(interest),
      },
    });
  }),
);

router.post(
  '/:id/interest',
  asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.id);
    const movie = await ensureMovie(movieId);
    const result = await run(
      `INSERT INTO watchlist_interests (user_id, movie_id)
       VALUES (?, ?)
       ON CONFLICT (user_id, movie_id) DO NOTHING`,
      [req.user.id, movieId],
    );

    if (result.rowsAffected > 0) {
      await recordActivity({
        diary: req.diary,
        userId: req.user.id,
        actionType: 'interested',
        movieTitle: movie.title,
        movieId,
      });
    }

    res.status(201).json({ interested: true, movieId });
  }),
);

router.delete(
  '/:id/interest',
  asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.id);
    const result = await run(
      'DELETE FROM watchlist_interests WHERE user_id = ? AND movie_id = ?',
      [req.user.id, movieId],
    );

    res.json({ interested: false, movieId, removed: result.rowsAffected > 0 });
  }),
);

router.delete(
  '/:id/watch',
  asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.id);
    const result = await run('DELETE FROM reviews WHERE diary_id = ? AND movie_id = ?', [
      req.diary.id,
      movieId,
    ]);

    if (!result.rowsAffected) {
      throw new AppError(404, 'Esse filme não está mais nos assistidos.');
    }

    res.json({ ok: true, movieId });
  }),
);

router.put(
  '/:id/soundtrack',
  asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.id);
    const rawTitle = String(req.body?.songTitle ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    const rawUrl = String(req.body?.songAudioUrl ?? '').trim();

    let title = null;
    let audioUrl = null;

    if (rawUrl) {
      if (rawUrl.length > MAX_SONG_URL_LENGTH) {
        throw new AppError(400, 'O link da prévia é longo demais.');
      }

      let url;

      try {
        url = new URL(rawUrl);
      } catch {
        throw new AppError(400, 'Informe um link válido para a prévia.');
      }

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new AppError(400, 'Use um link http(s) para a prévia.');
      }

      if (rawTitle.length > MAX_SONG_TITLE_LENGTH) {
        throw new AppError(400, 'O título da trilha é longo demais.');
      }

      audioUrl = rawUrl;
      title = rawTitle || 'Trilha sonora';
    } else if (rawTitle) {
      throw new AppError(400, 'Escolha uma faixa com prévia para salvar a trilha.');
    }

    const row = await one('SELECT * FROM movies WHERE tmdb_id = ?', [movieId]);

    if (!row) {
      throw new AppError(404, 'Mídia não encontrada na base.');
    }

    await run('UPDATE movies SET song_title = ?, song_audio_url = ? WHERE tmdb_id = ?', [
      title,
      audioUrl,
      movieId,
    ]);

    const updated = await one('SELECT * FROM movies WHERE tmdb_id = ?', [movieId]);

    res.json({
      soundtrack: { title, audioUrl },
      movie: serializeMovie(updated),
    });
  }),
);

router.put(
  '/:id/review',
  asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.id);
    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\u0000/g, '')
      .trim();
    const watchedAt = parseWatchedAt(req.body?.watchedAt);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new AppError(400, 'A nota deve ser de 1 a 5 estrelas.');
    }

    if (comment.length > 500) {
      throw new AppError(400, 'O comentário pode ter no máximo 500 caracteres.');
    }

    const movie = await ensureMovie(movieId);

    await run(
      `INSERT INTO reviews (diary_id, movie_id, user_id, rating, comment, watched_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(diary_id, movie_id, user_id) DO UPDATE SET
         rating = excluded.rating,
         comment = excluded.comment,
         watched_at = excluded.watched_at,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
      [req.diary.id, movieId, req.user.id, rating, comment, watchedAt],
    );

    // Já foi assistido: sai do Em Breve para não ficar preso sem botão de remover.
    await run('DELETE FROM watchlist_interests WHERE user_id = ? AND movie_id = ?', [
      req.user.id,
      movieId,
    ]);

    const review = await one(
      `SELECT id, user_id, rating, comment, watched_at, created_at, updated_at
         FROM reviews
        WHERE diary_id = ? AND movie_id = ? AND user_id = ?`,
      [req.diary.id, movieId, req.user.id],
    );

    await recordActivity({
      diary: req.diary,
      userId: req.user.id,
      actionType: 'rated',
      movieTitle: movie.title,
      movieId,
    });

    res.json({
      review: serializeReview(review),
      movie: serializeMovie(movie),
    });
  }),
);

export default router;
