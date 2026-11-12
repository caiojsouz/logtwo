import { all, one } from '../db/index.js';

export async function findDiaryForUser(userId) {
  return one(
    `SELECT d.*,
            u1.name AS user1_name,
            u1.avatar_data AS user1_avatar,
            u2.name AS user2_name,
            u2.avatar_data AS user2_avatar
       FROM diaries d
       JOIN users u1 ON u1.id = d.user1_id
  LEFT JOIN users u2 ON u2.id = d.user2_id
      WHERE d.user1_id = ? OR d.user2_id = ?
      LIMIT 1`,
    [userId, userId],
  );
}

export async function getDiaryById(diaryId) {
  return one(
    `SELECT d.*,
            u1.name AS user1_name,
            u1.avatar_data AS user1_avatar,
            u2.name AS user2_name,
            u2.avatar_data AS user2_avatar
       FROM diaries d
       JOIN users u1 ON u1.id = d.user1_id
  LEFT JOIN users u2 ON u2.id = d.user2_id
      WHERE d.id = ?`,
    [diaryId],
  );
}

export async function getDiaryReviews(diaryId, movieId = null) {
  const params = [diaryId];
  let movieFilter = '';

  if (movieId !== null) {
    movieFilter = 'AND r.movie_id = ?';
    params.push(movieId);
  }

  return all(
    `SELECT r.id, r.movie_id, r.user_id, r.rating, r.comment, r.watched_at, r.created_at, r.updated_at
       FROM reviews r
      WHERE r.diary_id = ? ${movieFilter}
      ORDER BY r.updated_at DESC, r.id DESC`,
    params,
  );
}
