import crypto from 'node:crypto';
import { safeEqual } from '../utils/tokens.js';

export function csrfMiddleware(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!safeEqual(req.body?._csrf, req.session.csrfToken)) {
      return res.status(403).render('error', {
        title: '요청을 처리할 수 없습니다',
        message: '보안 토큰이 만료되었습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.'
      });
    }
  }

  return next();
}
