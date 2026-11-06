import rateLimit from 'express-rate-limit';

const jsonMessage = (message) => ({ error: message });

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Muitas tentativas. Aguarde alguns minutos e tente novamente.'),
});

export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Muitas buscas em pouco tempo. Respire e tente novamente.'),
});
