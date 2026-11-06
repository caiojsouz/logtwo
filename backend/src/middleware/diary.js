import { AppError, asyncHandler } from '../lib/errors.js';
import { findDiaryForUser } from '../services/diaries.js';

export const requireActiveDiary = asyncHandler(async (req, res, next) => {
  const diary = await findDiaryForUser(req.user.id);

  if (!diary) {
    throw new AppError(409, 'Você ainda não tem um diário. Crie um ou entre com um código.');
  }

  if (!diary.user2_id) {
    throw new AppError(409, 'Seu diário ainda está esperando a segunda pessoa.');
  }

  req.diary = diary;
  next();
});
