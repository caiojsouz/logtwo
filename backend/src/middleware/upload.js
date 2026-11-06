import multer from 'multer';
import { AppError } from '../lib/errors.js';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// Memória, sem disco: o Render é efêmero. Os bytes viram data URL e ficam no Turso.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (req, file, callback) => {
    const allowed = /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype);
    callback(
      allowed ? null : new AppError(400, 'Envie uma imagem PNG, JPG, WEBP ou GIF.'),
      allowed,
    );
  },
});

export function avatarUpload(req, res, next) {
  upload.single('avatar')(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, 'A foto pode ter no máximo 2 MB.'));
      }

      return next(new AppError(400, 'Não foi possível enviar essa imagem.'));
    }

    return next(error);
  });
}

export function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => buffer[index] === byte)) {
    return 'image/png';
  }

  const ascii = (start, end) => buffer.subarray(start, end).toString('ascii');

  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return 'image/webp';
  }

  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') {
    return 'image/gif';
  }

  return null;
}
