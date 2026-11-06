import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const ISSUER = 'logtwo';

export function createSessionToken(userId) {
  return jwt.sign({}, config.jwtSecret, {
    subject: String(userId),
    issuer: ISSUER,
    expiresIn: '7d',
  });
}

export function readSessionToken(token) {
  const payload = jwt.verify(token, config.jwtSecret, { issuer: ISSUER });
  const userId = Number(payload.sub);

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Token inválido.');
  }

  return userId;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: config.cookie.sameSite,
    secure: config.cookie.secure,
    path: '/',
  };
}

export function setSessionCookie(res, userId) {
  res.cookie(config.cookie.name, createSessionToken(userId), {
    ...cookieOptions(),
    maxAge: config.cookie.maxAge,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookie.name, cookieOptions());
}
