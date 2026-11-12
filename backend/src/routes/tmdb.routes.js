import express from 'express';
import { AppError, asyncHandler } from '../lib/errors.js';
import { discoverTitles, normalizeDiscoverFilter } from '../lib/tmdb.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveDiary } from '../middleware/diary.js';
import { searchLimiter } from '../middleware/rateLimits.js';

const router = express.Router();

router.use(requireAuth, requireActiveDiary);

router.get(
  '/discover',
  searchLimiter,
  asyncHandler(async (req, res) => {
    const filter = normalizeDiscoverFilter(req.query.filter);

    if (!filter) {
      throw new AppError(400, 'Filtro de descoberta inválido.');
    }

    res.json({ filter, results: await discoverTitles(filter) });
  }),
);

export default router;
