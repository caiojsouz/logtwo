import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { config } from '../config.js';

function ensureLocalDirectory(url) {
  if (!url.startsWith('file:')) return;

  const rawPath = url.slice('file:'.length);
  if (!rawPath || rawPath.startsWith('//')) return;

  fs.mkdirSync(path.dirname(path.resolve(decodeURIComponent(rawPath))), { recursive: true });
}

ensureLocalDirectory(config.tursoUrl);

export const db = createClient({
  url: config.tursoUrl,
  authToken: config.tursoToken,
});

async function ensureColumn(table, column, definition) {
  const result = await db.execute(`PRAGMA table_info(${table})`);
  const exists = result.rows.some((row) => row.name === column);

  if (!exists) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

export async function initDatabase() {
  await db.execute('PRAGMA foreign_keys = ON');
  const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  await db.executeMultiple(schema);

  // Bancos antigos (Turso) não recebem colunas novas via CREATE TABLE IF NOT EXISTS.
  await ensureColumn('users', 'avatar_data', 'avatar_data TEXT');
  await ensureColumn('users', 'profile_song_audio_url', 'profile_song_audio_url TEXT');
  await ensureColumn('users', 'profile_song_cover_url', 'profile_song_cover_url TEXT');
  await ensureColumn('users', 'profile_song_title', 'profile_song_title TEXT');
  await ensureColumn('movies', 'release_date', 'release_date TEXT');
}

export async function all(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows;
}

export async function one(sql, args = []) {
  const rows = await all(sql, args);
  return rows[0] ?? null;
}

export async function run(sql, args = []) {
  return db.execute({ sql, args });
}
