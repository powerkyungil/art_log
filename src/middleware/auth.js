import { artistRepository } from '../repositories/artistRepository.js';

export function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  return next();
}

export async function requireArtist(req, res, next) {
  if (!req.session.artistId || !req.session.artistAuthVersion) {
    return res.redirect('/');
  }

  const artist = await artistRepository.findById(req.session.artistId);
  if (!artist || artist.status !== 'ACTIVE' || artist.access_token_version !== req.session.artistAuthVersion) {
    req.session.destroy(() => res.redirect('/'));
    return;
  }

  req.artist = artist;
  res.locals.artist = artist;
  return next();
}
