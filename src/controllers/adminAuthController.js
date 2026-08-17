import bcrypt from 'bcryptjs';
import { userRepository } from '../repositories/userRepository.js';
import { localNextPath } from '../utils/http.js';

function regenerateSession(request) {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

export const adminAuthController = {
  showLogin(req, res) {
    if (req.session.adminId) return res.redirect('/admin');
    return res.render('admin/login', {
      title: '관리자 로그인',
      next: localNextPath(req.query.next, '/admin'),
      error: null,
      loginId: ''
    });
  },

  async login(req, res) {
    const loginId = String(req.body.login_id || '').trim();
    const password = String(req.body.password || '');
    const next = localNextPath(req.body.next, '/admin');
    const user = await userRepository.findByLoginId(loginId);

    if (!user || user.role !== 'ADMIN' || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(422).render('admin/login', {
        title: '관리자 로그인',
        next,
        error: '아이디 또는 비밀번호를 확인해주세요.',
        loginId
      });
    }

    await regenerateSession(req);
    req.session.adminId = user.id;
    req.session.adminName = user.name;
    return res.redirect(next);
  },

  logout(req, res) {
    req.session.destroy(() => res.redirect('/admin/login'));
  }
};
