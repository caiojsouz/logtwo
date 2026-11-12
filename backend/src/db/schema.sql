PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_data TEXT,
  profile_song_audio_url TEXT,
  profile_song_cover_url TEXT,
  profile_song_title TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS diaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user1_id INTEGER NOT NULL,
  user2_id INTEGER,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (user2_id IS NULL OR user2_id <> user1_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_diaries_user1 ON diaries(user1_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diaries_user2 ON diaries(user2_id);

-- Cache local dos metadados do TMDB (inclui runtime para as horas totais).
CREATE TABLE IF NOT EXISTS movies (
  tmdb_id INTEGER PRIMARY KEY,
  media_type TEXT NOT NULL DEFAULT 'movie',
  title TEXT NOT NULL,
  original_title TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  release_date TEXT,
  runtime INTEGER,
  overview TEXT NOT NULL DEFAULT '',
  genres TEXT NOT NULL DEFAULT '[]',
  vote_average REAL,
  song_title TEXT,
  song_audio_url TEXT,
  watch_providers TEXT,
  providers_cached_at TEXT,
  cached_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  diary_id INTEGER NOT NULL,
  movie_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  watched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (diary_id, movie_id, user_id),
  FOREIGN KEY (diary_id) REFERENCES diaries(id) ON DELETE CASCADE,
  FOREIGN KEY (movie_id) REFERENCES movies(tmdb_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reviews_diary ON reviews(diary_id);
CREATE INDEX IF NOT EXISTS idx_reviews_movie ON reviews(diary_id, movie_id);

-- Indicações da dupla: uma linha por filme/diário, com autoria para remoção.
CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  diary_id INTEGER NOT NULL,
  movie_id INTEGER NOT NULL,
  added_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (diary_id, movie_id),
  FOREIGN KEY (diary_id) REFERENCES diaries(id) ON DELETE CASCADE,
  FOREIGN KEY (movie_id) REFERENCES movies(tmdb_id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recommendations_diary ON recommendations(diary_id, created_at);

-- Favoritos individuais (máximo de 4 por usuário).
CREATE TABLE IF NOT EXISTS favorite_movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  movie_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (user_id, movie_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (movie_id) REFERENCES movies(tmdb_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favorite_movies_user ON favorite_movies(user_id, created_at);

-- Interesse individual em lançamentos futuros (aba Em Breve).
CREATE TABLE IF NOT EXISTS watchlist_interests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  movie_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (user_id, movie_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (movie_id) REFERENCES movies(tmdb_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_watchlist_interests_user ON watchlist_interests(user_id, created_at);

CREATE TRIGGER IF NOT EXISTS trg_favorite_movies_limit
BEFORE INSERT ON favorite_movies
WHEN (SELECT COUNT(*) FROM favorite_movies WHERE user_id = NEW.user_id) >= 4
BEGIN
  SELECT RAISE(ABORT, 'favorite_limit_reached');
END;

-- Diário de atividades da dupla (Timeline).
CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  diary_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  media_title TEXT NOT NULL,
  movie_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (diary_id) REFERENCES diaries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_diary ON activity_logs(diary_id, created_at);

-- Dispositivos inscritos para Web Push (um por endpoint).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
