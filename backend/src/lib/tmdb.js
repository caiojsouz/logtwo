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

const TMDB_MAX_PAGE = 500;

export function normalizePage(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return 1;

  const page = Number(rawValue);

  if (!Number.isInteger(page) || page < 1) return null;

  return Math.min(page, TMDB_MAX_PAGE);
}

function totalPagesFrom(data, fallbackPage) {
  const total = Number(data?.total_pages);

  return Math.min(Number.isInteger(total) && total > 0 ? total : fallbackPage, TMDB_MAX_PAGE);
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

export function isAnimeSearchItem(item) {
  return (
    item?.original_language === 'ja' &&
    Array.isArray(item?.genre_ids) &&
    item.genre_ids.includes(16)
  );
}

function mapSearchItem(item, mediaType) {
  const type = mediaType || item.media_type;

  if (type !== 'movie' && type !== 'tv') return null;

  const releaseDate = type === 'tv' ? item.first_air_date || null : item.release_date || null;
  const title =
    type === 'tv'
      ? item.name || item.original_name || null
      : item.title || item.original_title || null;

  if (!title) return null;

  return {
    tmdbId: item.id,
    mediaType: type,
    title,
    originalTitle: (type === 'tv' ? item.original_name : item.original_title) || null,
    releaseDate,
    year: releaseDate ? releaseDate.slice(0, 4) : null,
    posterPath: item.poster_path || null,
    posterUrl: imageUrl(item.poster_path, 'w342'),
    overview: item.overview || '',
    voteAverage: typeof item.vote_average === 'number' ? item.vote_average : null,
  };
}

/**
 * Busca mista (filmes + séries) usada pela descoberta das listas.
 * Com o filtro "anime", consulta /search/tv e mantém apenas animações japonesas.
 */
export async function searchTitles(query, { page = 1, filter = null } = {}) {
  const safePage = Math.min(Math.max(1, page), TMDB_MAX_PAGE);
  const animeOnly = filter === 'anime';

  const data = await request(animeOnly ? '/search/tv' : '/search/multi', {
    query,
    language: config.tmdbLanguage,
    include_adult: 'false',
    page: safePage,
    ...(animeOnly ? { with_original_language: 'ja' } : {}),
  });

  const results = (data.results || [])
    .filter((item) => (animeOnly ? isAnimeSearchItem(item) : true))
    .map((item) => mapSearchItem(item, animeOnly ? 'tv' : item.media_type))
    .filter(Boolean);

  return {
    page: Number.isInteger(data.page) && data.page > 0 ? data.page : safePage,
    totalPages: totalPagesFrom(data, safePage),
    results,
  };
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

/**
 * Serviços de assinatura (flatrate) disponíveis no Brasil para o título.
 * O mesmo endpoint existe para filmes e séries; mediaType escolhe a rota.
 */
export async function getWatchProviders(tmdbId, mediaType = 'movie') {
  const path = mediaType === 'tv' ? `/tv/${tmdbId}/watch/providers` : `/movie/${tmdbId}/watch/providers`;
  const data = await request(path);
  const region = data?.results?.BR ?? null;
  const flatrate = Array.isArray(region?.flatrate) ? region.flatrate : [];
  const seen = new Set();

  return {
    link: region?.link || null,
    providers: flatrate
      .filter((provider) => provider?.provider_name && provider?.logo_path)
      .filter((provider) => {
        if (seen.has(provider.provider_id)) return false;
        seen.add(provider.provider_id);
        return true;
      })
      .map((provider) => ({
        id: provider.provider_id,
        name: provider.provider_name,
        logoUrl: imageUrl(provider.logo_path, 'w92'),
      })),
  };
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

const DISCOVER_FILTERS = {
  em_alta: { path: '/discover/movie', mediaType: 'movie' },
  anime: {
    path: '/discover/tv',
    mediaType: 'tv',
    withGenres: '16',
    withOriginalLanguage: 'ja',
  },
  terror: { path: '/discover/movie', mediaType: 'movie', withGenres: '27' },
  romance: { path: '/discover/movie', mediaType: 'movie', withGenres: '10749' },
  acao: { path: '/discover/movie', mediaType: 'movie', withGenres: '28' },
  comedia: { path: '/discover/movie', mediaType: 'movie', withGenres: '35' },
};

const FILTER_ALIASES = {
  '': 'em_alta',
  alta: 'em_alta',
  'em-alta': 'em_alta',
  popular: 'em_alta',
  animes: 'anime',
};

export function normalizeDiscoverFilter(rawValue) {
  const value = String(rawValue ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');

  const filter = FILTER_ALIASES[value] || value;

  return DISCOVER_FILTERS[filter] ? filter : null;
}

/**
 * Catálogo popular para a vitrine de descoberta das listas.
 * Cada filtro troca o endpoint e os parâmetros de gênero/idioma no TMDB.
 */
export async function discoverTitles(filter, page = 1) {
  const entry = DISCOVER_FILTERS[filter];

  if (!entry) {
    throw new AppError(400, 'Filtro de descoberta inválido.');
  }

  const safePage = Math.min(Math.max(1, page), TMDB_MAX_PAGE);

  const data = await request(entry.path, {
    language: config.tmdbLanguage,
    sort_by: 'popularity.desc',
    include_adult: 'false',
    page: safePage,
    ...(entry.withGenres ? { with_genres: entry.withGenres } : {}),
    ...(entry.withOriginalLanguage
      ? { with_original_language: entry.withOriginalLanguage }
      : {}),
  });

  const results = (data.results || [])
    .map((item) => {
      const releaseDate = item.release_date || item.first_air_date || null;

      return {
        tmdbId: item.id,
        mediaType: entry.mediaType,
        title: item.title || item.name || item.original_title || item.original_name || null,
        originalTitle: item.original_title || item.original_name || null,
        releaseDate,
        year: releaseDate ? releaseDate.slice(0, 4) : null,
        posterPath: item.poster_path || null,
        posterUrl: imageUrl(item.poster_path, 'w342'),
        overview: item.overview || '',
        voteAverage: typeof item.vote_average === 'number' ? item.vote_average : null,
      };
    })
    .filter((item) => item.title)
    .slice(0, 20);

  return {
    page: Number.isInteger(data.page) && data.page > 0 ? data.page : safePage,
    totalPages: totalPagesFrom(data, safePage),
    results,
  };
}
