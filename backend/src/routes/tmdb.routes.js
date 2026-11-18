import express from 'express';
import { AppError, asyncHandler } from '../lib/errors.js';
import {
  discoverTitles,
  getTvDetails,
  getTvSeasonEpisodes,
  normalizeDiscoverFilter,
  normalizePage,
  searchTitles,
} from '../lib/tmdb.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveDiary } from '../middleware/diary.js';
import { searchLimiter } from '../middleware/rateLimits.js';

const router = express.Router();

router.use(requireAuth, requireActiveDiary);

function parseIntegerParam(value, minimum, message) {
  if (typeof value !== 'string' || !value || /[^0-9]/.test(value)) {
    throw new AppError(400, message);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new AppError(400, message);
  }

  return parsed;
}

router.get(
  '/tv/:id',
  asyncHandler(async (req, res) => {
    const id = parseIntegerParam(req.params.id, 1, 'Série inválida.');
    const details = await getTvDetails(id);

    res.json(details);
  }),
);

router.get(
  '/tv/:id/season/:season_number',
  asyncHandler(async (req, res) => {
    const id = parseIntegerParam(req.params.id, 1, 'Série inválida.');
    const seasonNumber = parseIntegerParam(req.params.season_number, 0, 'Temporada inválida.');
    const episodes = await getTvSeasonEpisodes(id, seasonNumber);

    res.json({ episodes });
  }),
);

router.get(
  '/discover',
  searchLimiter,
  asyncHandler(async (req, res) => {
    const filter = normalizeDiscoverFilter(req.query.filter);
    const page = normalizePage(req.query.page);

    if (!filter) {
      throw new AppError(400, 'Filtro de descoberta inválido.');
    }

    if (!page) {
      throw new AppError(400, 'Página de descoberta inválida.');
    }

    const data = await discoverTitles(filter, page);

    res.json({ filter, page: data.page, totalPages: data.totalPages, results: data.results });
  }),
);

router.get(
  '/search',
  searchLimiter,
  asyncHandler(async (req, res) => {
    const query = String(req.query.q ?? '').trim();

    if (query.length < 2) {
      throw new AppError(400, 'Digite pelo menos 2 caracteres para buscar.');
    }

    if (query.length > 80) {
      throw new AppError(400, 'Busca muito longa.');
    }

    const page = normalizePage(req.query.page);

    if (!page) {
      throw new AppError(400, 'Página de busca inválida.');
    }

    const rawFilter = String(req.query.filter ?? '').trim();
    const filter = rawFilter ? normalizeDiscoverFilter(rawFilter) : null;

    if (rawFilter && !filter) {
      throw new AppError(400, 'Filtro de busca inválido.');
    }

    const data = await searchTitles(query, { page, filter });

    res.json({
      query,
      filter: filter ?? null,
      page: data.page,
      totalPages: data.totalPages,
      results: data.results,
    });
  }),
);

export default router;
