import { config } from '../config.js';
import { AppError } from './errors.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

function isConfigured() {
  return Boolean(config.tmdbReadToken || config.tmdbApiKey);
}

async function request(pathname, params = {}) {
  if (!isConfigured()) {
    throw new AppError(503, 'A busca de filmes está indisponível: a TMDB ainda não foi configurada no servidor.');
  }

  const url = new URL(`${TMDB_BASE}${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = { Accept: 'application/json' };

  if (config.tmdbReadToken) {
    headers.Authorization = `Bearer ${config.tmdbReadToken}`;
  } else {
    url.searchParams.set('api_key', config.tmdbApiKey);
  }

  let response;

  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
  } catch {
    throw new AppError(504, 'O TMDB demorou para responder. Tente novamente em instantes.');
  }

  if (response.status === 404) {
    throw new AppError(404, 'Filme não encontrado no TMDB.');
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(`[tmdb] ${response.status} em ${pathname}: ${detail.slice(0, 200)}`);
    throw new AppError(502, 'Não foi possível consultar o TMDB agora.');
  }

  return response.json();
}

export function imageUrl(path, size = 'w500') {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

function toRuntime(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function searchMovies(query) {
  const data = await request('/search/movie', {
    query,
    language: config.tmdbLanguage,
    include_adult: 'false',
    page: 1,
  });

  return (data.results || [])
    .map((movie) => ({
      tmdbId: movie.id,
      title: movie.title || movie.original_title || 'Sem título',
      originalTitle: movie.original_title || null,
      releaseDate: movie.release_date || null,
      year: movie.release_date ? movie.release_date.slice(0, 4) : null,
      posterPath: movie.poster_path || null,
      posterUrl: imageUrl(movie.poster_path),
      overview: movie.overview || '',
      voteAverage: typeof movie.vote_average === 'number' ? movie.vote_average : null,
    }))
    .filter((movie) => movie.title)
    .slice(0, 12);
}

export async function getUpcomingMovies() {
  const data = await request('/movie/upcoming', {
    language: config.tmdbLanguage,
    region: 'BR',
    page: 1,
  });

  return (data.results || [])
    .map((movie) => ({
      tmdbId: movie.id,
      title: movie.title || movie.original_title || 'Sem título',
      originalTitle: movie.original_title || null,
      posterPath: movie.poster_path || null,
      backdropPath: movie.backdrop_path || null,
      releaseDate: movie.release_date || null,
      runtime: null,
      overview: movie.overview || '',
      genres: [],
      voteAverage: typeof movie.vote_average === 'number' ? movie.vote_average : null,
    }))
    .filter((movie) => movie.title && movie.releaseDate)
    .slice(0, 24);
}

export async function getMovieDetails(tmdbId) {
  const data = await request(`/movie/${tmdbId}`, { language: config.tmdbLanguage });

  return {
    tmdbId: data.id,
    title: data.title || data.original_title || 'Sem título',
    originalTitle: data.original_title || null,
    posterPath: data.poster_path || null,
    backdropPath: data.backdrop_path || null,
    releaseDate: data.release_date || null,
    runtime: toRuntime(data.runtime),
    overview: data.overview || '',
    genres: (data.genres || []).map((genre) => genre.name),
    voteAverage: typeof data.vote_average === 'number' ? data.vote_average : null,
  };
}
