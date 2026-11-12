import express from 'express';
import { all, one, run } from '../db/index.js';
import { AppError, asyncHandler } from '../lib/errors.js';
import { serializeReview } from '../lib/serializers.js';
import { getUpcomingMovies, searchMovies } from '../lib/tmdb.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveDiary } from '../middleware/diary.js';
import { searchLimiter } from '../middleware/rateLimits.js';
import { recordActivity } from '../services/activity.js';
import { getDiaryReviews } from '../services/diaries.js';
import { ensureMovie, getDiaryMovieIds, saveMovie, serializeMovie } from '../services/movies.js';

const router = express.Router();

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

function selectUpcoming(userId) {
  return all(
    `SELECT m.*, CASE WHEN wi.id IS NULL THEN 0 ELSE 1 END AS interested
       FROM movies m
  LEFT JOIN watchlist_interests wi
         ON wi.movie_id = m.tmdb_id AND wi.user_id = ?
      WHERE m.release_date IS NOT NULL
        AND m.release_date > date('now')
   ORDER BY m.release_date ASC
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
    const rows = await selectUpcoming(req.user.id);

    if (rows.length > 0) {
      res.json({ movies: serializeUpcoming(rows), source: 'diary' });
      return;
    }

    // A base da dupla ainda não tem lançamentos futuros: preenche com o calendário do TMDB.
    let source = 'diary';

    try {
      const upcoming = await getUpcomingMovies();
      await Promise.all(upcoming.map((movie) => saveMovie(movie)));
      source = 'tmdb';
    } catch (error) {
      console.warn('[logtwo] Não foi possível carregar os lançamentos do TMDB:', error?.message);
    }

    const savedRows = source === 'tmdb' ? await selectUpcoming(req.user.id) : [];

    res.json({ movies: serializeUpcoming(savedRows), source });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.id);
    const row = await ensureMovie(movieId);
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
  '/:id/review',
  asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.id);
    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\u0000/g, '')
      .trim();

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new AppError(400, 'A nota deve ser de 1 a 5 estrelas.');
    }

    if (comment.length > 500) {
      throw new AppError(400, 'O comentário pode ter no máximo 500 caracteres.');
    }

    const movie = await ensureMovie(movieId);

    await run(
      `INSERT INTO reviews (diary_id, movie_id, user_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(diary_id, movie_id, user_id) DO UPDATE SET
         rating = excluded.rating,
         comment = excluded.comment,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
      [req.diary.id, movieId, req.user.id, rating, comment],
    );

    const review = await one(
      `SELECT id, user_id, rating, comment, created_at, updated_at
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
