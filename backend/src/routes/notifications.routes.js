import express from 'express';
import { run } from '../db/index.js';
import { AppError, asyncHandler } from '../lib/errors.js';
import { publicKey, pushEnabled, sendPushToUsers } from '../lib/push.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

function isValidEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

router.get(
  '/key',
  asyncHandler(async (req, res) => {
    res.json({ enabled: pushEnabled(), publicKey: publicKey() });
  }),
);

router.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    if (!pushEnabled()) {
      throw new AppError(503, 'As notificações ainda não estão configuradas no servidor.');
    }

    const subscription = req.body?.subscription ?? req.body;
    const endpoint = String(subscription?.endpoint ?? '').trim();
    const p256dh = String(subscription?.keys?.p256dh ?? '').trim();
    const auth = String(subscription?.keys?.auth ?? '').trim();

    if (!isValidEndpoint(endpoint) || !p256dh || !auth) {
      throw new AppError(400, 'Inscrição de notificação inválida.');
    }

    if (endpoint.length > 2048 || p256dh.length > 512 || auth.length > 256) {
      throw new AppError(400, 'Inscrição de notificação inválida.');
    }

    await run(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth`,
      [req.user.id, endpoint, p256dh, auth],
    );

    res.status(201).json({ ok: true });
  }),
);

router.post(
  '/test',
  asyncHandler(async (req, res) => {
    if (!pushEnabled()) {
      throw new AppError(503, 'As notificações ainda não estão configuradas no servidor.');
    }

    const result = await sendPushToUsers([req.user.id], {
      title: 'logtwo.',
      body: 'Teste de Push funcionou!',
      icon: '/assets/img/icon-192.png',
      badge: '/assets/img/icon-192.png',
      url: '/dashboard.html#perfil',
    });

    console.log(
      `[logtwo] Push de teste (usuário ${req.user.id}): ${result.found} subscription(s) encontrada(s), ${result.sent} envio(s).`,
    );

    if (result.found === 0) {
      throw new AppError(
        404,
        'Nenhum dispositivo inscrito para esta conta. Ative as notificações neste dispositivo primeiro.',
      );
    }

    res.json({ ok: true, subscriptions: result.found, delivered: result.sent });
  }),
);

export default router;
