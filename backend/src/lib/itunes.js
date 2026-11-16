const ITUNES_SEARCH = 'https://itunes.apple.com/search';
const MOVIE_STOREFRONTS = ['br', 'us'];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isSafePreview(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function queryItunes({ term, media, entity, country, limit }) {
  const url = new URL(ITUNES_SEARCH);
  url.searchParams.set('term', term);
  url.searchParams.set('media', media);
  url.searchParams.set('entity', entity);
  url.searchParams.set('country', country);
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return [];

  const data = await response.json();
  return Array.isArray(data?.results) ? data.results : [];
}

function resultYear(item) {
  const year = Number(String(item?.releaseDate || '').slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

/**
 * Prefere o filme cujo ano bate com o do TMDB (margem de 1 ano para lançamentos
 * que escorregam de dezembro para janeiro). Sem ano compatível, usa a primeira
 * prévia válida — a iTunes costuma listar releituras e edições do mesmo título.
 */
function chooseMoviePreview(results, year) {
  const withPreview = results.filter((item) => isSafePreview(item?.previewUrl));
  if (!withPreview.length) return null;
  if (!year) return withPreview[0].previewUrl;

  const yearMatch = withPreview.find((item) => {
    const itemYear = resultYear(item);
    return itemYear !== null && Math.abs(itemYear - year) <= 1;
  });

  return (yearMatch || withPreview[0]).previewUrl;
}

async function findMoviePreview(title, year) {
  for (const country of MOVIE_STOREFRONTS) {
    try {
      const results = await queryItunes({
        term: title,
        media: 'movie',
        entity: 'movie',
        country,
        limit: 10,
      });

      const preview = chooseMoviePreview(results, year);
      if (preview) return preview;
    } catch (error) {
      console.warn(`[itunes] falha ao buscar filme (${country}):`, error?.message);
    }
  }

  return null;
}

/**
 * Só aceita a prévia quando o nome da série (collectionName) realmente corresponde
 * ao título buscado. Sem fallback cego: um episódio homônimo de outra série
 * (ex.: "Stranger Things" como título de episódio) não vira preview.
 */
function chooseTvPreview(results, titleNorm) {
  for (const item of results) {
    if (!isSafePreview(item?.previewUrl)) continue;

    const show = normalize(item.collectionName);
    if (show && (show === titleNorm || show.includes(titleNorm))) {
      return item.previewUrl;
    }
  }

  return null;
}

async function findTvPreview(title) {
  const titleNorm = normalize(title);
  if (!titleNorm) return null;

  const results = await queryItunes({
    term: title,
    media: 'tvShow',
    entity: 'tvEpisode',
    country: 'us',
    limit: 5,
  });

  return chooseTvPreview(results, titleNorm);
}

/**
 * Prévia oficial em vídeo (.m4v) da Apple para um filme ou série/anime.
 * Filmes buscam pelo título original (sem o ano no term) e caem para a loja
 * americana quando a brasileira não tem previewUrl; séries usam tvEpisode.
 * Retorna null quando a obra não está no iTunes, e aí o frontend inicia o
 * carrossel direto nos backdrops do TMDB.
 */
export async function getApplePreview(title, year, mediaType = 'movie') {
  const query = String(title || '').trim();
  if (!query) return null;

  try {
    if (mediaType === 'tv') return await findTvPreview(query);

    const parsedYear = Number(year);
    return await findMoviePreview(query, Number.isInteger(parsedYear) ? parsedYear : null);
  } catch (error) {
    console.warn('[itunes] falha ao buscar prévia:', error?.message);
    return null;
  }
}
