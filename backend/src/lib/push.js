import * as webpushModule from 'web-push';
import { config } from '../config.js';
import { all, run } from '../db/index.js';

const webpush = webpushModule.default ?? webpushModule;
const enabled = Boolean(config.vapid.publicKey && config.vapid.privateKey);

if (enabled) {
  webpush.setVapidDetails(
    config.vapid.subject,
    config.vapid.publicKey,
    config.vapid.privateKey,
  );
}

export function pushEnabled() {
  return enabled;
}

export function publicKey() {
  return config.vapid.publicKey;
}

/**
 * Envia o payload para todos os dispositivos inscritos dos usuários indicados.
 * Inscrições expiradas (404/410) são removidas do banco.
 */
export async function sendPushToUsers(userIds, payload) {
  if (!enabled || userIds.length === 0) return;

  const placeholders = userIds.map(() => '?').join(', ');
  const subscriptions = await all(
    `SELECT id, endpoint, p256dh, auth
       FROM push_subscriptions
      WHERE user_id IN (${placeholders})`,
    userIds,
  );

  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

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
}
