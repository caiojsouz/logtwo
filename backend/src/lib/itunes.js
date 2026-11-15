const ITUNES_SEARCH = 'https://itunes.apple.com/search';

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

async function queryItunes(term, media, entity) {
  const url = new URL(ITUNES_SEARCH);
  url.searchParams.set('term', term);
  url.searchParams.set('media', media);
  url.searchParams.set('entity', entity);
  url.searchParams.set('country', 'US');
  url.searchParams.set('limit', '5');

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return [];

  const data = await response.json();
  return Array.isArray(data?.results) ? data.results : [];
}

/**
 * Só aceita a prévia quando o nome da série (collectionName) realmente corresponde
 * ao título buscado. Sem fallback cego: um episódio homônimo de outra série
 * (ex.: "Stranger Things" como título de episódio) não vira preview.
 */
function choosePreview(results, titleNorm) {
  for (const item of results) {
    if (!isSafePreview(item?.previewUrl)) continue;

    const show = normalize(item.collectionName);
    if (show && (show === titleNorm || show.includes(titleNorm))) {
      return item.previewUrl;
    }
  }

  return null;
}

/**
 * Prévia oficial em vídeo (.m4v) da Apple para uma série/anime.
 * A iTunes Search API não expõe mais filmes (media=movie retorna vazio), então
 * só séries têm vídeo — via entity=tvEpisode, que traz o preview do 1º episódio.
 * Retorna null para filmes ou obras fora do iTunes; aí o frontend inicia o
 * carrossel direto nos backdrops do TMDB.
 */
export async function getApplePreview(title, _year, mediaType = 'movie') {
  if (mediaType !== 'tv') return null;

  const titleNorm = normalize(title);
  if (!titleNorm) return null;

  try {
    const results = await queryItunes(String(title), 'tvShow', 'tvEpisode');
    return choosePreview(results, titleNorm);
  } catch (error) {
    console.warn('[itunes] falha ao buscar prévia:', error?.message);
    return null;
  }
}
