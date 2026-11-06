import 'dotenv/config';
import crypto from 'node:crypto';

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

const jwtSecret = process.env.JWT_SECRET || (isProduction ? '' : crypto.randomBytes(48).toString('hex'));

if (isProduction && !jwtSecret) {
  throw new Error('JWT_SECRET é obrigatório em produção.');
}

const defaultOrigins = 'http://localhost:3000,http://127.0.0.1:3000';

if (isProduction && !process.env.FRONTEND_ORIGINS) {
  throw new Error('FRONTEND_ORIGINS é obrigatório em produção (ex.: https://logtwo.vercel.app).');
}

if (isProduction) {
  if (!process.env.TURSO_DATABASE_URL?.startsWith('libsql://')) {
    throw new Error('TURSO_DATABASE_URL deve apontar para o Turso (libsql://...) em produção.');
  }
  if (!process.env.TURSO_AUTH_TOKEN) {
    throw new Error('TURSO_AUTH_TOKEN é obrigatório em produção.');
  }
}

const frontendOrigins = (process.env.FRONTEND_ORIGINS || defaultOrigins)
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

if (isProduction && frontendOrigins.length === 0) {
  throw new Error('FRONTEND_ORIGINS é obrigatório em produção (ex.: https://logtwo.vercel.app).');
}

const cookieSameSite = (process.env.COOKIE_SAMESITE || (isProduction ? 'none' : 'lax')).toLowerCase();

if (!['lax', 'strict', 'none'].includes(cookieSameSite)) {
  throw new Error('COOKIE_SAMESITE deve ser "lax", "strict" ou "none".');
}

if (cookieSameSite === 'none' && !isProduction) {
  console.warn('[logtwo] SameSite=None exige HTTPS; em desenvolvimento use COOKIE_SAMESITE=lax.');
}

export const config = {
  env,
  isProduction,
  port: Number(process.env.PORT || 3000),
  jwtSecret,
  tursoUrl: process.env.TURSO_DATABASE_URL || 'file:./data/logtwo.db',
  tursoToken: process.env.TURSO_AUTH_TOKEN || undefined,
  tmdbReadToken: process.env.TMDB_ACCESS_TOKEN || undefined,
  tmdbApiKey: process.env.TMDB_API_KEY || undefined,
  frontendOrigins,
  cookie: {
    name: 'logtwo_session',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: cookieSameSite,
    secure: isProduction,
  },
  tmdbLanguage: process.env.TMDB_LANGUAGE || 'pt-BR',
};
