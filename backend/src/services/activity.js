import { one, run } from '../db/index.js';
import { sendPushToUsers } from '../lib/push.js';

const ACTION_VERBS = {
  added: 'adicionou',
  rated: 'avaliou',
  favorited: 'favoritou',
  interested: 'marcou interesse em',
};

function partnerIdOf(diary, userId) {
  return diary.user1_id === userId ? diary.user2_id : diary.user1_id;
}

/**
 * Registra a ação na timeline e avisa a outra poltrona via Web Push.
 * Nunca lança: falhas de push/timeline não devem derrubar a ação principal.
 */
export async function recordActivity({
  diary,
  userId,
  actionType,
  movieTitle,
  movieId = null,
}) {
  try {
    await run(
      `INSERT INTO activity_logs (diary_id, user_id, action_type, media_title, movie_id)
       VALUES (?, ?, ?, ?, ?)`,
      [diary.id, userId, actionType, movieTitle, movieId],
    );

    const partnerId = partnerIdOf(diary, userId);
    if (!partnerId || partnerId === userId) return;

    const actor = await one('SELECT name FROM users WHERE id = ?', [userId]);
    const actorName = actor?.name ? actor.name.split(/\s+/)[0] : 'Sua dupla';
    const verb = ACTION_VERBS[actionType] || 'registrou';

    // O push não bloqueia a resposta: só a timeline precisa estar pronta.
    void sendPushToUsers([partnerId], {
      title: 'Novo registro no diário!',
      body: `${actorName} ${verb} ${movieTitle}.`,
      icon: '/assets/img/icon-192.png',
      badge: '/assets/img/icon-192.png',
      url: '/dashboard.html#timeline',
      movieId,
    });
  } catch (error) {
    console.warn('[logtwo] Não foi possível registrar a atividade:', error?.message || error);
  }
}
