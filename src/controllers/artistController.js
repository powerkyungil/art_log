import { assignmentRepository } from '../repositories/assignmentRepository.js';
import { artistRepository } from '../repositories/artistRepository.js';
import { noticeRepository } from '../repositories/noticeRepository.js';
import { submissionRepository } from '../repositories/submissionRepository.js';
import { compareArtistPassword, hashArtistPassword } from '../utils/artistAuth.js';
import { displayName } from '../utils/format.js';
import { isValidDate, isValidUrl, required } from '../utils/validation.js';

const CHANNELS = ['Instagram', 'YouTube', 'Blog', 'TikTok', '기타'];

function regenerateSession(request) {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function renderArtistError(res, view, data, message) {
  return res.status(422).render(view, { ...data, error: message });
}

function normalizeSubmissionBody(body) {
  const rawPostUrls = Array.isArray(body.post_url) ? body.post_url : [body.post_url];
  const postUrls = [...new Set(rawPostUrls.map(required).filter(Boolean))];
  return {
    upload_date: required(body.upload_date),
    upload_channel: required(body.upload_channel),
    post_url: postUrls[0] || '',
    post_urls: postUrls
  };
}

function toRepositorySubmission(form) {
  return {
    uploadDate: form.upload_date,
    uploadChannel: form.upload_channel,
    postUrls: form.post_urls
  };
}

export const artistController = {
  landing(req, res) {
    if (req.session.artistId && req.session.artistAuthVersion) return res.redirect('/artist');
    return res.render('artist/landing', { title: '작가 로그인', loginName: '', error: null });
  },

  async login(req, res) {
    const loginName = required(req.body.name);
    const password = String(req.body.password || '');
    const artist = await artistRepository.findByName(loginName);

    if (!artist || artist.status !== 'ACTIVE' || !(await compareArtistPassword(password, artist.password_hash))) {
      return res.status(422).render('artist/landing', {
        title: '작가 로그인',
        loginName,
        error: '작가명 또는 비밀번호를 확인해주세요.'
      });
    }

    await regenerateSession(req);
    req.session.artistId = artist.id;
    req.session.artistAuthVersion = artist.access_token_version;
    return res.redirect('/artist');
  },

  logout(req, res) {
    req.session.destroy(() => res.redirect('/'));
  },

  showPasswordChange(req, res) {
    return res.render('artist/password', { title: '비밀번호 변경', error: null });
  },

  async changePassword(req, res) {
    const currentPassword = String(req.body.current_password || '');
    const newPassword = String(req.body.new_password || '');
    const passwordConfirmation = String(req.body.password_confirmation || '');

    if (newPassword.length < 4) {
      return res.status(422).render('artist/password', { title: '비밀번호 변경', error: '새 비밀번호는 4자 이상 입력해주세요.' });
    }
    if (newPassword !== passwordConfirmation) {
      return res.status(422).render('artist/password', { title: '비밀번호 변경', error: '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.' });
    }
    if (!(await compareArtistPassword(currentPassword, req.artist.password_hash))) {
      return res.status(422).render('artist/password', { title: '비밀번호 변경', error: '현재 비밀번호를 확인해주세요.' });
    }

    const passwordHash = await hashArtistPassword(newPassword);
    const artist = await artistRepository.updatePassword(req.artist.id, passwordHash);
    req.session.artistAuthVersion = artist.access_token_version;
    req.flash('success', '비밀번호가 변경되었습니다.');
    return res.redirect('/artist');
  },

  async home(req, res) {
    const [currentAssignment, nextAssignment, notices, activity] = await Promise.all([
      assignmentRepository.findCurrentForArtist(req.artist.id),
      assignmentRepository.findNextForArtist(req.artist.id),
      noticeRepository.list({ includeHidden: false }),
      submissionRepository.listForArtist(req.artist.id)
    ]);
    const currentSubmission = currentAssignment
      ? activity.find((item) => item.assignment_id === currentAssignment.id)?.submission_id
        ? activity.find((item) => item.assignment_id === currentAssignment.id)
        : null
      : null;
    return res.render('artist/home', {
      title: `${displayName(req.artist.name)} 홈`,
      currentAssignment,
      nextAssignment,
      notices: notices.slice(0, 5),
      activity,
      currentSubmission
    });
  },

  async showSubmissionForm(req, res) {
    const assignment = await assignmentRepository.findByIdForArtist(req.query.assignment_id, req.artist.id);
    if (!assignment) {
      return res.status(404).render('error', { title: '미션을 찾을 수 없습니다', message: '제출할 수 있는 미션이 없습니다.' });
    }
    if (new Date(assignment.start_at).getTime() > Date.now()) {
      return res.status(422).render('error', { title: '아직 제출할 수 없습니다', message: '제출 시작일 이후에 제출할 수 있습니다.' });
    }
    const submission = await submissionRepository.findByArtistAndAssignment(req.artist.id, assignment.id);
    if (submission && submission.status === 'CONFIRMED') {
      return res.status(422).render('error', { title: '수정할 수 없습니다', message: '관리자 확인완료 후에는 제출 내용을 수정할 수 없습니다.' });
    }
    return res.render('artist/submission-form', {
      title: submission ? '제출 내용 수정' : '미션 제출',
      assignment,
      submission,
      channels: CHANNELS,
      error: null
    });
  },

  async createSubmission(req, res) {
    const assignment = await assignmentRepository.findByIdForArtist(req.body.assignment_id, req.artist.id);
    const form = normalizeSubmissionBody(req.body);
    if (!assignment) return res.status(404).render('error', { title: '미션을 찾을 수 없습니다', message: '존재하지 않거나 제출할 수 없는 미션입니다.' });
    if (new Date(assignment.start_at).getTime() > Date.now()) return res.status(422).render('error', { title: '아직 제출할 수 없습니다', message: '제출 시작일 이후에 제출할 수 있습니다.' });
    const error = validateSubmission(form);
    if (error) return renderArtistError(res, 'artist/submission-form', { title: '미션 제출', assignment, submission: form, channels: CHANNELS }, error);

    const existing = await submissionRepository.findByArtistAndAssignment(req.artist.id, assignment.id);
    if (existing) {
      if (existing.status === 'CONFIRMED') return res.status(422).render('error', { title: '수정할 수 없습니다', message: '관리자 확인완료 후에는 수정할 수 없습니다.' });
      await submissionRepository.updateByArtist(existing.id, req.artist.id, toRepositorySubmission(form));
      req.flash('success', '제출 내용이 수정되었습니다.');
      return res.redirect(`/artist/submissions/${existing.id}/success`);
    }

    const submission = await submissionRepository.create({
      artistId: req.artist.id,
      assignmentId: assignment.id,
      ...toRepositorySubmission(form)
    });
    req.flash('success', '미션이 제출되었습니다.');
    return res.redirect(`/artist/submissions/${submission.id}/success`);
  },

  async history(req, res) {
    const activity = await submissionRepository.listForArtist(req.artist.id);
    return res.render('artist/history', { title: '나의 활동 내역', activity });
  },

  async success(req, res) {
    const submission = await submissionRepository.findById(req.params.id);
    if (!submission || submission.artist_id !== req.artist.id) {
      return res.status(404).render('error', { title: '제출 내역을 찾을 수 없습니다', message: '본인의 제출 내역만 확인할 수 있습니다.' });
    }
    return res.render('artist/success', { title: '제출 완료', submission });
  },

  async showEdit(req, res) {
    const submission = await submissionRepository.findById(req.params.id);
    if (!submission || submission.artist_id !== req.artist.id) return res.status(404).render('error', { title: '제출 내역을 찾을 수 없습니다', message: '본인의 제출 내역만 수정할 수 있습니다.' });
    const assignment = await assignmentRepository.findByIdForArtist(submission.assignment_id, req.artist.id);
    if (!assignment) return res.status(422).render('error', { title: '수정할 수 없습니다', message: '현재 수정할 수 없는 미션입니다.' });
    if (submission.status === 'CONFIRMED') return res.status(422).render('error', { title: '수정할 수 없습니다', message: '관리자 확인완료 후에는 수정할 수 없습니다.' });
    return res.render('artist/submission-form', {
      title: '제출 내용 수정',
      assignment,
      submission,
      channels: CHANNELS,
      error: null
    });
  },

  async update(req, res) {
    const submission = await submissionRepository.findById(req.params.id);
    const form = normalizeSubmissionBody(req.body);
    if (!submission || submission.artist_id !== req.artist.id) return res.status(404).render('error', { title: '제출 내역을 찾을 수 없습니다', message: '본인의 제출 내역만 수정할 수 있습니다.' });
    const assignment = await assignmentRepository.findByIdForArtist(submission.assignment_id, req.artist.id);
    if (!assignment) return res.status(422).render('error', { title: '수정할 수 없습니다', message: '현재 수정할 수 없는 미션입니다.' });
    if (submission.status === 'CONFIRMED') return res.status(422).render('error', { title: '수정할 수 없습니다', message: '관리자 확인완료 후에는 수정할 수 없습니다.' });
    const error = validateSubmission(form);
    if (error) return renderArtistError(res, 'artist/submission-form', { title: '제출 내용 수정', assignment, submission: form, channels: CHANNELS }, error);
    await submissionRepository.updateByArtist(submission.id, req.artist.id, toRepositorySubmission(form));
    req.flash('success', '제출 내용이 수정되었습니다.');
    return res.redirect(`/artist/submissions/${submission.id}/success`);
  }
};

function validateSubmission(form) {
  if (!isValidDate(form.upload_date)) return '업로드 날짜를 올바르게 입력해주세요.';
  if (!CHANNELS.includes(form.upload_channel)) return '업로드 채널을 선택해주세요.';
  if (!form.post_urls.length) return '게시물 URL을 한 개 이상 입력해주세요.';
  const invalidUrlIndex = form.post_urls.findIndex((url) => !isValidUrl(url));
  if (invalidUrlIndex >= 0) return `${invalidUrlIndex + 1}번째 URL은 http:// 또는 https://로 시작해야 합니다.`;
  return null;
}
