export function notFoundHandler(req, res) {
  return res.status(404).render('error', {
    title: '페이지를 찾을 수 없습니다',
    message: '요청하신 페이지가 존재하지 않습니다.'
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  console.error(error);
  return res.status(500).render('error', {
    title: '오류가 발생했습니다',
    message: process.env.NODE_ENV === 'development'
      ? error.message
      : '잠시 후 다시 시도해주세요.'
  });
}
