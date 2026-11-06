import express from 'express';
import { one, run } from '../db/index.js';
import { AppError, asyncHandler } from '../lib/errors.js';
import { serializeReview } from '../lib/serializers.js';
import { searchMovies } from '../lib/tmdb.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveDiary } from '../middleware/diary.js';
import { searchLimiter } from '../middleware/rateLimits.js';
import { getDiaryReviews } from '../services/diaries.js';
import { ensureMovie, getDiaryMovieIds, serializeMovie } from '../services/movies.js';

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

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.id);
    const row = await ensureMovie(movieId);
    const reviews = await getDiaryReviews(req.diary.id, movieId);

    res.json({ movie: serializeMovie(row, reviews.map(serializeReview)) });
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

    res.json({
      review: serializeReview(review),
      movie: serializeMovie(movie),
    });
  }),
);

export default router;
