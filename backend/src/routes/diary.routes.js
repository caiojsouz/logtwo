import crypto from 'node:crypto';
import express from 'express';
import { all, one, run } from '../db/index.js';
import { AppError, asyncHandler } from '../lib/errors.js';
import { serializeDiary, serializeReview } from '../lib/serializers.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveDiary } from '../middleware/diary.js';
import { findDiaryForUser, getDiaryById } from '../services/diaries.js';
import { serializeMovie } from '../services/movies.js';

const router = express.Router();
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode() {
  const bytes = crypto.randomBytes(8);
  let code = '';

  for (const byte of bytes) {
    code += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
  }

  return code;
}

function isUniqueViolation(error) {
  return /unique|constraint/i.test(String(error?.message || ''));
}

router.get(
  '/',
  requireAuth,
  requireActiveDiary,
  asyncHandler(async (req, res) => {
    const diaryId = req.diary.id;

    // Estatísticas leem estritamente a aba Assistidos (tabela reviews).
    // Favoritos e indicações nunca entram no total nem nas horas.
    const totals = await one(
      `SELECT COUNT(*) AS movies_count,
              COALESCE(SUM(m.runtime), 0) AS minutes
         FROM movies m
        WHERE m.tmdb_id IN (SELECT DISTINCT movie_id FROM reviews WHERE diary_id = ?)`,
      [diaryId],
    );

    const perUser = await all(
      `SELECT user_id, COUNT(*) AS review_count, AVG(rating) AS average_rating
         FROM reviews
        WHERE diary_id = ?
        GROUP BY user_id`,
      [diaryId],
    );

    const rows = await all(
      `SELECT m.*,
              r.id AS review_id,
              r.user_id,
              r.rating,
              r.comment,
              r.watched_at,
              r.created_at AS review_created_at,
              r.updated_at AS review_updated_at
         FROM reviews r
         JOIN movies m ON m.tmdb_id = r.movie_id
        WHERE r.diary_id = ?
        ORDER BY r.updated_at DESC, r.id DESC`,
      [diaryId],
    );

    const moviesById = new Map();

    for (const row of rows) {
      let movie = moviesById.get(row.tmdb_id);

      if (!movie) {
        movie = serializeMovie(row, []);
        moviesById.set(row.tmdb_id, movie);
      }

      movie.reviews.push(
        serializeReview({
          id: row.review_id,
          user_id: row.user_id,
          rating: row.rating,
          comment: row.comment,
          watched_at: row.watched_at,
          created_at: row.review_created_at,
          updated_at: row.review_updated_at,
        }),
      );
    }

    const members = [
      { id: req.diary.user1_id, name: req.diary.user1_name },
      { id: req.diary.user2_id, name: req.diary.user2_name },
    ];

    const byUser = {};

    for (const member of members) {
      byUser[member.id] = { count: 0, average: null };
    }

    for (const row of perUser) {
      byUser[row.user_id] = {
        count: Number(row.review_count),
        average: row.average_rating === null ? null : Number(Number(row.average_rating).toFixed(2)),
      };
    }

    const totalMinutes = Number(totals?.minutes || 0);

    res.json({
      diary: serializeDiary(req.diary, req.user.id),
      stats: {
        movieCount: Number(totals?.movies_count || 0),
        totalMinutes,
        totalHours: Number((totalMinutes / 60).toFixed(2)),
        byUser,
      },
      movies: [...moviesById.values()],
    });
  }),
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await findDiaryForUser(req.user.id);

    if (existing) {
      throw new AppError(409, 'Você já participa de um diário.');
    }

    let diaryId = null;

    for (let attempt = 0; attempt < 5 && diaryId === null; attempt += 1) {
      const inviteCode = generateInviteCode();

      try {
        const result = await run('INSERT INTO diaries (user1_id, invite_code) VALUES (?, ?)', [
          req.user.id,
          inviteCode,
        ]);
        diaryId = Number(result.lastInsertRowid);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }

    if (diaryId === null) {
      throw new AppError(500, 'Não foi possível gerar seu código agora. Tente novamente.');
    }

    const diary = await getDiaryById(diaryId);
    res.status(201).json({ diary: serializeDiary(diary, req.user.id) });
  }),
);

router.post(
  '/join',
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = String(req.body?.code ?? '')
      .trim()
      .toUpperCase();

    if (!/^[A-Z0-9]{8}$/.test(code)) {
      throw new AppError(400, 'O código de convite tem 8 caracteres.');
    }

    const diary = await one(
      `SELECT d.*,
              u1.name AS user1_name,
              u2.name AS user2_name
         FROM diaries d
         JOIN users u1 ON u1.id = d.user1_id
    LEFT JOIN users u2 ON u2.id = d.user2_id
        WHERE d.invite_code = ?`,
      [code],
    );

    if (!diary) {
      throw new AppError(404, 'Código não encontrado. Confira com sua dupla.');
    }

    if (diary.user1_id === req.user.id) {
      throw new AppError(400, 'Esse é o seu próprio diário. Envie o código para a sua dupla.');
    }

    if (diary.user2_id) {
      throw new AppError(409, 'Esse diário já está completo.');
    }

    const existing = await findDiaryForUser(req.user.id);

    if (existing) {
      throw new AppError(409, 'Você já participa de um diário.');
    }

    const update = await run('UPDATE diaries SET user2_id = ? WHERE id = ? AND user2_id IS NULL', [
      req.user.id,
      diary.id,
    ]);

    if (update.rowsAffected !== 1) {
      throw new AppError(409, 'Esse diário acabou de ser preenchido por outra pessoa.');
    }

    const updatedDiary = await getDiaryById(diary.id);
    res.json({ diary: serializeDiary(updatedDiary, req.user.id) });
  }),
);

export default router;
