import express from 'express';
import { all, one, run } from '../db/index.js';
import { AppError, asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveDiary } from '../middleware/diary.js';
import { recordActivity } from '../services/activity.js';
import { ensureMovie, serializeMovie } from '../services/movies.js';

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

function serializeRecommendation(row) {
  return {
    ...serializeMovie(row),
    recommendationId: row.recommendation_id,
    recommendedAt: row.recommended_at,
    recommendedBy: {
      id: row.added_by,
      name: row.added_by_name,
    },
  };
}

async function findRecommendation(diaryId, movieId) {
  return one(
    `SELECT m.*,
            r.id AS recommendation_id,
            r.added_by,
            r.created_at AS recommended_at,
            u.name AS added_by_name
       FROM recommendations r
       JOIN movies m ON m.tmdb_id = r.movie_id
       JOIN users u ON u.id = r.added_by
      WHERE r.diary_id = ? AND r.movie_id = ?`,
    [diaryId, movieId],
  );
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await all(
      `SELECT m.*,
              r.id AS recommendation_id,
              r.added_by,
              r.created_at AS recommended_at,
              u.name AS added_by_name
         FROM recommendations r
         JOIN movies m ON m.tmdb_id = r.movie_id
         JOIN users u ON u.id = r.added_by
        WHERE r.diary_id = ?
        ORDER BY r.created_at DESC, r.id DESC`,
      [req.diary.id],
    );

    res.json({ recommendations: rows.map(serializeRecommendation) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.body?.movieId);

    const movie = await ensureMovie(movieId);

    try {
      await run(
        'INSERT INTO recommendations (diary_id, movie_id, added_by) VALUES (?, ?, ?)',
        [req.diary.id, movieId, req.user.id],
      );
    } catch (error) {
      if (/unique|constraint/i.test(String(error?.message || ''))) {
        throw new AppError(409, 'Esse filme já está nas indicações de vocês.');
      }

      throw error;
    }

    const row = await findRecommendation(req.diary.id, movieId);

    await recordActivity({
      diary: req.diary,
      userId: req.user.id,
      actionType: 'added',
      movieTitle: movie.title,
      movieId,
    });

    res.status(201).json({ recommendation: serializeRecommendation(row) });
  }),
);

router.delete(
  '/:movieId',
  asyncHandler(async (req, res) => {
    const movieId = parseMovieId(req.params.movieId);
    const row = await one(
      'SELECT id FROM recommendations WHERE diary_id = ? AND movie_id = ?',
      [req.diary.id, movieId],
    );

    if (!row) {
      throw new AppError(404, 'Essa indicação não existe mais.');
    }

    await run('DELETE FROM recommendations WHERE id = ?', [row.id]);
    res.json({ ok: true });
  }),
);

export default router;
