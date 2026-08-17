import bcrypt from 'bcryptjs';

export const DEFAULT_ARTIST_PASSWORD = '1234';

export function hashArtistPassword(password) {
  return bcrypt.hash(password, 12);
}

export function compareArtistPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash || '');
}
