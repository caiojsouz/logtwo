export function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at,
  };
}

export function serializeDiary(diary, userId) {
  if (!diary) return null;

  const isCreator = diary.user1_id === userId;
  const isActive = Boolean(diary.user2_id);
  const members = [{ id: diary.user1_id, name: diary.user1_name }];

  if (diary.user2_id) {
    members.push({ id: diary.user2_id, name: diary.user2_name });
  }

  const partner = isActive
    ? {
        id: isCreator ? diary.user2_id : diary.user1_id,
        name: isCreator ? diary.user2_name : diary.user1_name,
      }
    : null;

  return {
    id: diary.id,
    status: isActive ? 'active' : 'pending',
    createdAt: diary.created_at,
    members,
    partner,
    // O código só é exposto para quem criou e enquanto o diário está incompleto.
    inviteCode: isCreator && !isActive ? diary.invite_code : null,
  };
}

export function serializeReview(review) {
  return {
    id: review.id,
    userId: review.user_id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.created_at,
    updatedAt: review.updated_at,
  };
}
