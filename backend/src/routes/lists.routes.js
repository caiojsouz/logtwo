import express from 'express';
import { all, one, run } from '../db/index.js';
import { AppError, asyncHandler } from '../lib/errors.js';
import { imageUrl } from '../lib/tmdb.js';
import { requireAuth } from '../middleware/auth.js';
import { requireActiveDiary } from '../middleware/diary.js';

const router = express.Router();
const MAX_TITLE_LENGTH = 60;
const MAX_ITEM_TITLE_LENGTH = 200;
const MAX_POSTER_PATH_LENGTH = 128;
const MEDIA_TYPES = new Set(['movie', 'tv']);

router.use(requireAuth, requireActiveDiary);

function parseId(rawId, label) {
  if (!/^\d+$/.test(String(rawId))) {
    throw new AppError(400, `${label} inválido.`);
  }

  const id = Number(rawId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(400, `${label} inválido.`);
  }

  return id;
}

function parseTitle(rawTitle) {
  const title = String(rawTitle ?? '')
    .trim()
    .replace(/\s+/g, ' ');

  if (title.length < 2 || title.length > MAX_TITLE_LENGTH) {
    throw new AppError(400, `Informe um nome entre 2 e ${MAX_TITLE_LENGTH} caracteres para a lista.`);
  }

  return title;
}

function parseItemTitle(rawTitle) {
  const title = String(rawTitle ?? '')
    .trim()
    .replace(/\s+/g, ' ');

  if (!title || title.length > MAX_ITEM_TITLE_LENGTH) {
    throw new AppError(400, 'Título inválido para salvar na lista.');
  }

  return title;
}

function parseMediaType(rawType) {
  const mediaType = String(rawType ?? 'movie').trim();

  if (!MEDIA_TYPES.has(mediaType)) {
    throw new AppError(400, 'Tipo de mídia inválido.');
  }

  return mediaType;
}

function parsePosterPath(rawPath) {
  if (rawPath === null || rawPath === undefined || rawPath === '') return null;

  const posterPath = String(rawPath).trim();

  if (!posterPath.startsWith('/') || posterPath.length > MAX_POSTER_PATH_LENGTH) {
    throw new AppError(400, 'Pôster inválido.');
  }

  return posterPath;
}

function serializeItem(item) {
  return {
    id: item.id,
    listId: item.list_id,
    tmdbId: item.tmdb_id,
    mediaType: item.media_type,
    title: item.title,
    posterPath: item.poster_path || null,
    posterUrl: imageUrl(item.poster_path, 'w342'),
    addedAt: item.added_at,
  };
}

function serializeList(list, items = []) {
  return {
    id: list.id,
    userId: list.user_id,
    ownerName: list.owner_name || null,
    title: list.title,
    createdAt: list.created_at,
    items: items.map(serializeItem),
  };
}

async function loadOwnLists(userIds) {
  const placeholders = userIds.map(() => '?').join(', ');
  const lists = await all(
    `SELECT l.*, u.name AS owner_name
       FROM custom_lists l
       JOIN users u ON u.id = l.user_id
      WHERE l.user_id IN (${placeholders})
      ORDER BY l.created_at ASC, l.id ASC`,
    userIds,
  );

  if (lists.length === 0) return [];

  const listPlaceholders = lists.map(() => '?').join(', ');
  const items = await all(
    `SELECT *
       FROM list_items
      WHERE list_id IN (${listPlaceholders})
      ORDER BY added_at ASC, id ASC`,
    lists.map((list) => list.id),
  );
  const itemsByList = new Map();

  for (const item of items) {
    const bucket = itemsByList.get(item.list_id) || [];
    bucket.push(item);
    itemsByList.set(item.list_id, bucket);
  }

  return lists.map((list) => serializeList(list, itemsByList.get(list.id) || []));
}

async function loadOwnedList(listId, userId) {
  const list = await one('SELECT * FROM custom_lists WHERE id = ?', [listId]);

  if (!list) {
    throw new AppError(404, 'Lista não encontrada.');
  }

  if (list.user_id !== userId) {
    throw new AppError(403, 'Você só pode alterar as suas próprias listas.');
  }

  return list;
}

async function loadListItem(listId, itemId) {
  const item = await one('SELECT * FROM list_items WHERE id = ? AND list_id = ?', [
    itemId,
    listId,
  ]);

  if (!item) {
    throw new AppError(404, 'Item não encontrado nessa lista.');
  }

  return item;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userIds = [req.diary.user1_id, req.diary.user2_id].filter(Boolean);
    res.json({ lists: await loadOwnLists(userIds) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const title = parseTitle(req.body?.title);
    const result = await run('INSERT INTO custom_lists (user_id, title) VALUES (?, ?)', [
      req.user.id,
      title,
    ]);
    const list = await one(
      `SELECT l.*, u.name AS owner_name
         FROM custom_lists l
         JOIN users u ON u.id = l.user_id
        WHERE l.id = ?`,
      [Number(result.lastInsertRowid)],
    );

    res.status(201).json({ list: serializeList(list) });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const listId = parseId(req.params.id, 'Lista');
    await loadOwnedList(listId, req.user.id);
    await run('DELETE FROM custom_lists WHERE id = ?', [listId]);

    res.json({ ok: true });
  }),
);

router.post(
  '/:id/items',
  asyncHandler(async (req, res) => {
    const listId = parseId(req.params.id, 'Lista');
    await loadOwnedList(listId, req.user.id);

    const tmdbId = parseId(req.body?.tmdbId, 'Título');
    const mediaType = parseMediaType(req.body?.mediaType);
    const title = parseItemTitle(req.body?.title);
    const posterPath = parsePosterPath(req.body?.posterPath);

    await run(
      `INSERT INTO list_items (list_id, tmdb_id, media_type, title, poster_path)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (list_id, tmdb_id, media_type)
       DO UPDATE SET title = excluded.title, poster_path = excluded.poster_path`,
      [listId, tmdbId, mediaType, title, posterPath],
    );

    const item = await one(
      'SELECT * FROM list_items WHERE list_id = ? AND tmdb_id = ? AND media_type = ?',
      [listId, tmdbId, mediaType],
    );

    res.status(201).json({ item: serializeItem(item) });
  }),
);

router.delete(
  '/:id/items/:itemId',
  asyncHandler(async (req, res) => {
    const listId = parseId(req.params.id, 'Lista');
    const itemId = parseId(req.params.itemId, 'Item');
    await loadOwnedList(listId, req.user.id);
    await loadListItem(listId, itemId);
    await run('DELETE FROM list_items WHERE id = ? AND list_id = ?', [itemId, listId]);

    res.json({ ok: true });
  }),
);

export default router;
