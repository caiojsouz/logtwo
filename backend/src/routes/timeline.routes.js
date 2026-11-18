import express from 'express';
import { all } from '../db/index.js';
import { asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveDiary } from '../middleware/diary.js';

const router = express.Router();
const LIMIT = 40;

router.get(
  '/',
  requireAuth,
  requireActiveDiary,
  asyncHandler(async (req, res) => {
    const rows = await all(
      `SELECT a.id,
              a.action_type,
              a.media_title,
              a.movie_id,
              a.created_at,
              u.id AS user_id,
              u.name AS user_name,
              u.avatar_data,
              m.song_title,
              m.song_audio_url,
              m.song_cover_url,
              m.song_track_id,
              m.song_artist_name,
              m.song_start_time,
              m.song_end_time
         FROM activity_logs a
         JOIN users u ON u.id = a.user_id
    LEFT JOIN movies m ON m.tmdb_id = a.movie_id
        WHERE a.diary_id = ?
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ?`,
      [req.diary.id, LIMIT],
    );

    res.json({
      events: rows.map((row) => ({
        id: row.id,
        actionType: row.action_type,
        mediaTitle: row.media_title,
        movieId: row.movie_id,
        songTitle: row.song_title || null,
        songAudioUrl: row.song_audio_url || null,
        songCoverUrl: row.song_cover_url || null,
        songTrackId: row.song_track_id ?? null,
        songArtistName: row.song_artist_name || null,
        songStartTime: row.song_start_time ?? 0,
        songEndTime: row.song_end_time ?? 30,
        createdAt: row.created_at,
        user: {
          id: row.user_id,
          name: row.user_name,
          avatarUrl: row.avatar_data || null,
        },
      })),
    });
  }),
);

export default router;
