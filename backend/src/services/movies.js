import { all, one, run } from '../db/index.js';
import { getMovieDetails, getWatchProviders, imageUrl } from '../lib/tmdb.js';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PROVIDERS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROVIDERS_RETRY_MS = 60 * 60 * 1000;
const TMDB_RETRY_MS = 5 * 60 * 1000;

let tmdbUnavailableUntil = 0;

export async function getMovieRow(tmdbId) {
  return one('SELECT * FROM movies WHERE tmdb_id = ?', [tmdbId]);
}

export async function saveMovie(movie) {
  await run(
    `INSERT INTO movies (
       tmdb_id, media_type, title, original_title, poster_path, backdrop_path,
       release_date, runtime, overview, genres, vote_average, cached_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT(tmdb_id) DO UPDATE SET
       title = excluded.title,
       original_title = excluded.original_title,
       poster_path = excluded.poster_path,
       backdrop_path = excluded.backdrop_path,
       release_date = excluded.release_date,
       runtime = excluded.runtime,
       overview = excluded.overview,
       genres = excluded.genres,
       vote_average = excluded.vote_average,
       cached_at = excluded.cached_at`,
    [
      movie.tmdbId,
      movie.mediaType || 'movie',
      movie.title,
      movie.originalTitle,
      movie.posterPath,
      movie.backdropPath,
      movie.releaseDate,
      movie.runtime,
      movie.overview,
      JSON.stringify(movie.genres || []),
      movie.voteAverage,
    ],
  );
}

function isFresh(row) {
  const cachedAt = Date.parse(row.cached_at);
  return Number.isFinite(cachedAt) && Date.now() - cachedAt < CACHE_TTL_MS;
}

/**
 * O feed /movie/upcoming usa a data regional (BR), enquanto /movie/{id} devolve
 * a data primária — que pode já ter passado. Não regride uma estreia futura,
 * senão o título some da aba Em Breve depois de abrir a ficha.
 */
function mergeReleaseDate(previous, next) {
  if (!next) return previous ?? null;

  const today = new Date().toISOString().slice(0, 10);

  if (previous && previous > today && next <= today) return previous;

  return next;
}

/**
 * Retorna o cache local. Se estiver ausente, velho ou sem runtime, busca no TMDB.
 * Se o TMDB falhar e já houver cache, o cache é usado como fallback.
 */
export async function ensureMovie(tmdbId) {
  const cached = await getMovieRow(tmdbId);
  const needsRefresh = !cached || !isFresh(cached) || cached.runtime === null;

  if (!needsRefresh) return cached;

  try {
    const details = await getMovieDetails(tmdbId);
    await saveMovie({
      ...details,
      releaseDate: mergeReleaseDate(cached?.release_date, details.releaseDate),
    });
    return (await getMovieRow(tmdbId)) ?? cached;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

function parseGenres(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseProviders(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((provider) => provider?.name && provider?.logoUrl)
      .map((provider) => ({
        id: provider.id ?? null,
        name: String(provider.name),
        logoUrl: String(provider.logoUrl),
      }));
  } catch {
    return [];
  }
}

/**
 * Onde assistir no Brasil (assinaturas). O resultado fica em cache no próprio
 * registro de mídia para os cards não consultarem o TMDB a cada abertura.
 */
export async function ensureMovieProviders(row) {
  if (!row) return [];

  const cachedAt = Date.parse(row.providers_cached_at);
  const hasTimestamp = Number.isFinite(cachedAt);
  const hasValue = row.watch_providers !== null && row.watch_providers !== undefined;

  if (hasTimestamp && hasValue && Date.now() - cachedAt < PROVIDERS_TTL_MS) {
    return parseProviders(row.watch_providers);
  }

  // Falha recente: aguarda antes de tentar de novo, mas mantém o cache anterior.
  if (hasTimestamp && !hasValue && Date.now() - cachedAt < PROVIDERS_RETRY_MS) {
    return [];
  }

  if (Date.now() < tmdbUnavailableUntil) return parseProviders(row.watch_providers);

  try {
    const { providers } = await getWatchProviders(row.tmdb_id, row.media_type || 'movie');
    const serialized = JSON.stringify(providers);

    await run(
      `UPDATE movies
          SET watch_providers = ?,
              providers_cached_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE tmdb_id = ?`,
      [serialized, row.tmdb_id],
    );

    row.watch_providers = serialized;
    row.providers_cached_at = new Date().toISOString();
    return providers;
  } catch (error) {
    if (error?.status === 503) {
      tmdbUnavailableUntil = Date.now() + TMDB_RETRY_MS;
    } else {
      console.warn('[logtwo] Não foi possível carregar os streamings:', error?.message || error);
    }

    await run(
      `UPDATE movies
          SET watch_providers = NULL,
              providers_cached_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE tmdb_id = ?`,
      [row.tmdb_id],
    ).catch(() => {});

    row.watch_providers = null;
    row.providers_cached_at = new Date().toISOString();
    return [];
  }
}

export function serializeMovie(row, reviews = []) {
  return {
    tmdbId: row.tmdb_id,
    mediaType: row.media_type || 'movie',
    title: row.title,
    originalTitle: row.original_title,
    posterPath: row.poster_path,
    posterUrl: imageUrl(row.poster_path),
    backdropUrl: imageUrl(row.backdrop_path, 'w1280'),
    releaseDate: row.release_date,
    year: row.release_date ? row.release_date.slice(0, 4) : null,
    runtime: row.runtime,
    overview: row.overview || '',
    genres: parseGenres(row.genres),
    voteAverage: row.vote_average,
    songTitle: row.song_title || null,
    songAudioUrl: row.song_audio_url || null,
    providers: parseProviders(row.watch_providers),
    reviews,
  };
}

export async function getDiaryMovieIds(diaryId) {
  const rows = await all('SELECT DISTINCT movie_id FROM reviews WHERE diary_id = ?', [diaryId]);
  return rows.map((row) => row.movie_id);
}
