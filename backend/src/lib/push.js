import * as webpushModule from 'web-push';
import { config } from '../config.js';
import { all, run } from '../db/index.js';

const webpush = webpushModule.default ?? webpushModule;

// Chaves coladas no painel costumam vir com aspas, espaços ou "=" de padding.
// O web-push exige base64url sem "=", então normalizamos antes de usar.
function sanitizeKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/=+$/, '');
}

const publicKeyValue = sanitizeKey(config.vapid.publicKey);
const privateKeyValue = sanitizeKey(config.vapid.privateKey);
const subject = String(config.vapid.subject || '').trim() || 'mailto:contato@logtwo.app';

let enabled = Boolean(publicKeyValue && privateKeyValue);

if (enabled) {
  try {
    webpush.setVapidDetails(subject, publicKeyValue, privateKeyValue);
  } catch (error) {
    enabled = false;
    console.warn('[logtwo] Push desativado:', error?.message || error);
  }
}

export function pushEnabled() {
  return enabled;
}

export function publicKey() {
  return publicKeyValue;
}

/**
 * Envia o payload para todos os dispositivos inscritos dos usuários indicados.
 * Inscrições expiradas (404/410) são removidas do banco.
 */
export async function sendPushToUsers(userIds, payload) {
  const targets = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];

  if (!enabled || targets.length === 0) {
    return { enabled, found: 0, sent: 0 };
  }

  const placeholders = targets.map(() => '?').join(', ');
  const subscriptions = await all(
    `SELECT id, user_id, endpoint, p256dh, auth
       FROM push_subscriptions
      WHERE user_id IN (${placeholders})`,
    targets,
  );

  console.log(
    `[logtwo] Push: ${subscriptions.length} subscription(s) encontrada(s) no banco para o(s) usuário(s) ${targets.join(', ')}.`,
  );

  if (subscriptions.length === 0) {
    return { enabled, found: 0, sent: 0 };
  }

  const body = JSON.stringify(payload);
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          { TTL: 60 * 60 * 24 },
        );
        sent += 1;
      } catch (error) {
        const status = error?.statusCode;

        if (status === 404 || status === 410) {
          await run('DELETE FROM push_subscriptions WHERE id = ?', [subscription.id]).catch(
            () => {},
          );
          return;
        }

        console.warn('[logtwo] Falha ao enviar push:', status || error?.message || error);
      }
    }),
  );

  return { enabled, found: subscriptions.length, sent };
}
