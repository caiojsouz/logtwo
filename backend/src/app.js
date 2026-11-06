import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { one } from './db/index.js';
import { AppError, asyncHandler } from './lib/errors.js';
import authRoutes from './routes/auth.routes.js';
import diaryRoutes from './routes/diary.routes.js';
import moviesRoutes from './routes/movies.routes.js';
import profileRoutes from './routes/profile.routes.js';
import recommendationsRoutes from './routes/recommendations.routes.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(currentDir, '..', '..', 'frontend');
const hasFrontend = fs.existsSync(path.join(frontendDir, 'index.html'));

function originGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.get('origin');

  // Clientes que não são navegadores (curl, integrações) não enviam Origin.
  if (!origin) return next();

  if (!config.frontendOrigins.includes(origin.replace(/\/$/, ''))) {
    return next(new AppError(403, 'Origem não autorizada.'));
  }

  return next();
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.frontendOrigins.includes(origin.replace(/\/$/, ''))) {
          return callback(null, true);
        }
        return callback(new AppError(403, 'Origem não autorizada.'));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use(originGuard);

  app.get(
    '/api/health',
    asyncHandler(async (req, res) => {
      await one('SELECT 1 AS ok');
      res.json({ status: 'ok' });
    }),
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/diary', diaryRoutes);
  app.use('/api/movies', moviesRoutes);
  app.use('/api/recommendations', recommendationsRoutes);
  app.use('/api/profile', profileRoutes);

  if (hasFrontend) {
    app.use(express.static(frontendDir, { extensions: ['html'] }));
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    if (error instanceof AppError) {
      return res.status(error.status).json({ error: error.message });
    }

    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Corpo da requisição inválido.' });
    }

    console.error('[logtwo] erro inesperado:', error);
    return res.status(500).json({ error: 'Algo deu errado por aqui. Tente novamente.' });
  });

  return app;
}

export { frontendDir, hasFrontend };
