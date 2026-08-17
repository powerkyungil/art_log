import { artistRepository } from '../repositories/artistRepository.js';
import { assignmentRepository } from '../repositories/assignmentRepository.js';
import { noticeRepository } from '../repositories/noticeRepository.js';
import { submissionRepository } from '../repositories/submissionRepository.js';
import { DEFAULT_ARTIST_PASSWORD, hashArtistPassword } from '../utils/artistAuth.js';
import { createAccessToken } from '../utils/tokens.js';
import { isValidDateTime, positiveInteger, required } from '../utils/validation.js';
import { toSqlDateTime } from '../utils/http.js';
import { normalizeMonth } from '../utils/month.js';

const CHANNELS = ['Instagram', 'YouTube', 'Blog', 'TikTok', '기타'];
const ARTIST_STATUSES = ['ACTIVE', 'INACTIVE', 'COMPLETED'];

function formError(res, view, data, message, status = 422) {
  return res.status(status).render(view, { ...data, error: message });
}

function buildDashboard(rows, assignments, query) {
  const artists = new Map();

  for (const row of rows) {
    if (!artists.has(row.artist_id)) {
      artists.set(row.artist_id, {
        id: row.artist_id,
        name: row.artist_name,
        status: row.artist_status,
        weeks: new Map()
      });
    }
    const applicable = Number(row.is_applicable) === 1;
    artists.get(row.artist_id).weeks.set(row.assignment_id, {
      assignmentId: row.assignment_id,
      week: row.week,
      applicable,
      status: applicable ? row.status || 'NOT_SUBMITTED' : 'NOT_APPLICABLE',
      postUrl: row.post_url,
      submittedAt: row.submitted_at
    });
  }

  const now = Date.now();
  const targetAssignments = assignments.filter((assignment) => new Date(assignment.start_at).getTime() <= now);
  const current = assignments.find((assignment) => {
    const start = new Date(assignment.start_at).getTime();
    const due = new Date(assignment.due_at).getTime();
    return start <= now && due >= now;
  }) || [...targetAssignments].reverse()[0] || null;

  const assignmentGroups = [];
  for (const assignment of assignments) {
    let group = assignmentGroups.find((item) => item.week === assignment.week);
    if (!group) {
      group = { week: assignment.week, assignments: [], isCurrent: false };
      assignmentGroups.push(group);
    }
    group.assignments.push(assignment);
  }
  assignmentGroups.forEach((group) => {
    group.isCurrent = group.assignments.some((assignment) => assignment.id === current?.id);
  });

  const artistRows = [...artists.values()].map((artist) => {
    const weeks = assignments.map((assignment) => artist.weeks.get(assignment.id) || {
      assignmentId: assignment.id,
      week: assignment.week,
      applicable: false,
      status: 'NOT_APPLICABLE',
      postUrl: null
    });
    const applicableAssignments = targetAssignments.filter((assignment) => artist.weeks.get(assignment.id)?.applicable);
    const submittedCount = applicableAssignments.filter((assignment) => {
      const status = artist.weeks.get(assignment.id)?.status;
      return status === 'SUBMITTED' || status === 'CONFIRMED';
    }).length;
    return {
      ...artist,
      weeks,
      progressRate: applicableAssignments.length ? Math.round((submittedCount / applicableAssignments.length) * 100) : 0,
      currentStatus: current && artist.weeks.get(current.id)?.applicable
        ? artist.weeks.get(current.id).status
        : 'NOT_APPLICABLE'
    };
  });

  assignmentGroups.forEach((group) => {
    const groupAssignmentIds = group.assignments.map((assignment) => assignment.id);
    const applicableWeeks = artistRows.flatMap((artist) => artist.weeks)
      .filter((week) => groupAssignmentIds.includes(week.assignmentId) && week.applicable);
    group.applicableCount = applicableWeeks.length;
    group.submittedCount = applicableWeeks.filter((week) => ['SUBMITTED', 'CONFIRMED'].includes(week.status)).length;
  });

  const search = String(query.search || '').trim().toLowerCase();
  const status = String(query.status || '');
  const filtered = artistRows.filter((artist) => {
    const matchesSearch = !search || artist.name.toLowerCase().includes(search);
    const matchesStatus = !status || artist.currentStatus === status;
    return matchesSearch && matchesStatus;
  });

  return {
    assignments,
    assignmentGroups,
    targetAssignments,
    currentAssignment: current,
    artists: filtered,
    filters: { search: query.search || '', status }
  };
}

export const adminController = {
  async dashboard(req, res) {
    const [assignments, rows] = await Promise.all([
      assignmentRepository.list({ includeHidden: false }),
      submissionRepository.dashboardRows()
    ]);
    const dashboard = buildDashboard(rows, assignments, req.query);
    return res.render('admin/dashboard', {
      title: '대시보드',
      dashboard
    });
  },

  async assignmentProgress(req, res) {
    const month = normalizeMonth(req.query.month);
    const [assignments, rows] = await Promise.all([
      assignmentRepository.list({ includeHidden: false, month }),
      submissionRepository.dashboardRows({ month })
    ]);
    const dashboard = buildDashboard(rows, assignments, req.query);
    return res.render('admin/progress/index', { title: '과제 진행 현황', dashboard, month });
  },

  async artists(req, res) {
    const filters = { search: req.query.search || '', status: req.query.status || '' };
    const artists = await artistRepository.list(filters);
    return res.render('admin/artists/index', { title: '작가 관리', artists, filters, statuses: ARTIST_STATUSES });
  },

  showArtistCreate(req, res) {
    return res.render('admin/artists/form', {
      title: '작가 등록',
      mode: 'create',
      artist: { name: '', phone: '', sns_account: '', status: 'ACTIVE' },
      statuses: ARTIST_STATUSES,
      error: null
    });
  },

  async createArtist(req, res) {
    const name = required(req.body.name);
    if (!name) {
      return formError(res, 'admin/artists/form', {
        title: '작가 등록', mode: 'create', artist: req.body, statuses: ARTIST_STATUSES
      }, '작가명을 입력해주세요.');
    }
    if (await artistRepository.findByName(name)) {
      return formError(res, 'admin/artists/form', {
        title: '작가 등록', mode: 'create', artist: req.body, statuses: ARTIST_STATUSES
      }, '이미 사용 중인 작가명입니다. 작가명이 로그인 아이디로 사용됩니다.');
    }

    const { tokenHash } = createAccessToken();
    const passwordHash = await hashArtistPassword(DEFAULT_ARTIST_PASSWORD);
    const artist = await artistRepository.create({
      name,
      phone: required(req.body.phone),
      snsAccount: required(req.body.sns_account),
      status: ARTIST_STATUSES.includes(req.body.status) ? req.body.status : 'ACTIVE',
      tokenHash,
      passwordHash
    });
    req.flash('success', '작가가 등록되었습니다. 초기 비밀번호는 1234입니다.');
    return res.redirect(`/admin/artists/${artist.id}`);
  },

  async artistDetail(req, res) {
    const artist = await artistRepository.findById(req.params.id);
    if (!artist) return res.status(404).render('error', { title: '작가를 찾을 수 없습니다', message: '존재하지 않는 작가입니다.' });
    const activity = await submissionRepository.listForArtist(artist.id);
    return res.render('admin/artists/detail', {
      title: `${artist.name} 작가`, artist, activity
    });
  },

  async showArtistEdit(req, res) {
    const artist = await artistRepository.findById(req.params.id);
    if (!artist) return res.status(404).render('error', { title: '작가를 찾을 수 없습니다', message: '존재하지 않는 작가입니다.' });
    return res.render('admin/artists/form', {
      title: '작가 수정', mode: 'edit', artist, statuses: ARTIST_STATUSES, error: null
    });
  },

  async updateArtist(req, res) {
    const name = required(req.body.name);
    const status = ARTIST_STATUSES.includes(req.body.status) ? req.body.status : 'ACTIVE';
    if (!name) {
      const artist = { ...(await artistRepository.findById(req.params.id)), ...req.body };
      return formError(res, 'admin/artists/form', {
        title: '작가 수정', mode: 'edit', artist, statuses: ARTIST_STATUSES
      }, '작가명을 입력해주세요.');
    }
    if (await artistRepository.findOtherByName(name, req.params.id)) {
      const artist = { ...(await artistRepository.findById(req.params.id)), ...req.body };
      return formError(res, 'admin/artists/form', {
        title: '작가 수정', mode: 'edit', artist, statuses: ARTIST_STATUSES
      }, '이미 사용 중인 작가명입니다. 작가명이 로그인 아이디로 사용됩니다.');
    }
    await artistRepository.update(req.params.id, {
      name,
      phone: required(req.body.phone),
      snsAccount: required(req.body.sns_account),
      status
    });
    req.flash('success', '작가 정보가 수정되었습니다.');
    return res.redirect(`/admin/artists/${req.params.id}`);
  },

  async resetArtistPassword(req, res) {
    const artist = await artistRepository.findById(req.params.id);
    if (!artist) return res.status(404).render('error', { title: '작가를 찾을 수 없습니다', message: '존재하지 않는 작가입니다.' });
    const passwordHash = await hashArtistPassword(DEFAULT_ARTIST_PASSWORD);
    await artistRepository.updatePassword(artist.id, passwordHash);
    req.flash('success', '작가 비밀번호가 1234로 초기화되었습니다.');
    return res.redirect(`/admin/artists/${artist.id}`);
  },

  async assignments(req, res) {
    const month = normalizeMonth(req.query.month);
    const assignments = await assignmentRepository.list({ includeHidden: true, month });
    return res.render('admin/assignments/index', { title: '과제 관리', assignments, month });
  },

  async showAssignmentCreate(req, res) {
    const artists = await artistRepository.list({});
    return res.render('admin/assignments/form', {
      title: '과제 등록', mode: 'create', assignment: {
        week: '', title: '', topic: '', description: '', recommended_channel: '',
        start_at: '', due_at: '', is_visible: 0, target_scope: 'SELECTED'
      }, artists, selectedArtistIds: [], channels: CHANNELS, error: null
    });
  },

  async createAssignment(req, res) {
    const data = normalizeAssignmentBody(req.body);
    const error = validateAssignment(data);
    const artists = await artistRepository.list({});
    const selectedArtists = await artistRepository.findActiveByIds(data.artistIds);
    if (error) return formError(res, 'admin/assignments/form', { title: '과제 등록', mode: 'create', assignment: req.body, artists, selectedArtistIds: data.artistIds, channels: CHANNELS }, error);
    if (data.targetScope === 'SELECTED' && (!data.artistIds.length || selectedArtists.length !== data.artistIds.length)) {
      return formError(res, 'admin/assignments/form', { title: '과제 등록', mode: 'create', assignment: req.body, artists, selectedArtistIds: data.artistIds, channels: CHANNELS }, '활동중인 작가를 한 명 이상 선택해주세요.');
    }
    try {
      await assignmentRepository.create(data);
    } catch (dbError) {
      if (isDuplicateWeekError(dbError)) return formError(res, 'admin/assignments/form', { title: '과제 등록', mode: 'create', assignment: req.body, artists, selectedArtistIds: data.artistIds, channels: CHANNELS }, '이미 등록된 주차입니다. 기존 과제를 수정하거나 다른 주차를 선택해주세요.');
      throw dbError;
    }
    req.flash('success', '과제가 등록되었습니다.');
    return res.redirect('/admin/assignments');
  },

  async showAssignmentEdit(req, res) {
    const assignment = await assignmentRepository.findById(req.params.id);
    if (!assignment) return res.status(404).render('error', { title: '과제를 찾을 수 없습니다', message: '존재하지 않는 과제입니다.' });
    const [artists, selectedArtistIds] = await Promise.all([
      artistRepository.list({}),
      assignmentRepository.findTargetArtistIds(assignment.id)
    ]);
    return res.render('admin/assignments/form', { title: '과제 수정', mode: 'edit', assignment, artists, selectedArtistIds, channels: CHANNELS, error: null });
  },

  async updateAssignment(req, res) {
    const existing = await assignmentRepository.findById(req.params.id);
    if (!existing) return res.status(404).render('error', { title: '과제를 찾을 수 없습니다', message: '존재하지 않는 과제입니다.' });
    const data = normalizeAssignmentBody(req.body);
    const artists = await artistRepository.list({});
    const selectedArtists = await artistRepository.findActiveByIds(data.artistIds);
    const error = validateAssignment(data);
    if (error) return formError(res, 'admin/assignments/form', { title: '과제 수정', mode: 'edit', assignment: { ...existing, ...req.body }, artists, selectedArtistIds: data.artistIds, channels: CHANNELS }, error);
    if (data.targetScope === 'SELECTED' && (!data.artistIds.length || selectedArtists.length !== data.artistIds.length)) {
      return formError(res, 'admin/assignments/form', { title: '과제 수정', mode: 'edit', assignment: { ...existing, ...req.body }, artists, selectedArtistIds: data.artistIds, channels: CHANNELS }, '활동중인 작가를 한 명 이상 선택해주세요.');
    }
    try {
      await assignmentRepository.update(req.params.id, data);
    } catch (dbError) {
      if (isDuplicateWeekError(dbError)) return formError(res, 'admin/assignments/form', { title: '과제 수정', mode: 'edit', assignment: { ...existing, ...req.body }, artists, selectedArtistIds: data.artistIds, channels: CHANNELS }, '이미 등록된 주차입니다. 다른 주차를 선택해주세요.');
      throw dbError;
    }
    req.flash('success', '과제가 수정되었습니다.');
    return res.redirect('/admin/assignments');
  },

  async toggleAssignment(req, res) {
    await assignmentRepository.toggleVisibility(req.params.id);
    req.flash('success', '과제 공개 상태가 변경되었습니다.');
    return res.redirect('/admin/assignments');
  },

  async submissions(req, res) {
    const month = normalizeMonth(req.query.month);
    const filters = {
      search: req.query.search || '', status: req.query.status || '',
      assignmentId: req.query.assignment_id || '', channel: req.query.channel || '', month
    };
    const [submissions, assignments] = await Promise.all([
      submissionRepository.list(filters),
      assignmentRepository.list({ includeHidden: true, month })
    ]);
    return res.render('admin/submissions/index', { title: '제출 내역', submissions, assignments, filters, channels: CHANNELS });
  },

  async submissionDetail(req, res) {
    const submission = await submissionRepository.findById(req.params.id);
    if (!submission) return res.status(404).render('error', { title: '제출 내역을 찾을 수 없습니다', message: '존재하지 않는 제출 내역입니다.' });
    return res.render('admin/submissions/detail', { title: '제출 상세', submission, error: null });
  },

  async updateSubmission(req, res) {
    const status = ['SUBMITTED', 'CONFIRMED'].includes(req.body.status) ? req.body.status : 'SUBMITTED';
    await submissionRepository.updateByAdmin(req.params.id, {
      status,
      adminMemo: required(req.body.admin_memo),
      adminId: req.session.adminId
    });
    req.flash('success', '제출 상태가 수정되었습니다.');
    return res.redirect(`/admin/submissions/${req.params.id}`);
  },

  async notices(req, res) {
    const notices = await noticeRepository.list({ includeHidden: true });
    return res.render('admin/notices/index', { title: '공지사항', notices });
  },

  showNoticeCreate(req, res) {
    return res.render('admin/notices/form', {
      title: '공지사항 등록', mode: 'create', notice: { title: '', content: '', is_pinned: 0, is_visible: 1, published_at: '' }, error: null
    });
  },

  async createNotice(req, res) {
    const data = normalizeNoticeBody(req.body);
    if (!data.title || !data.content) {
      return formError(res, 'admin/notices/form', { title: '공지사항 등록', mode: 'create', notice: req.body }, '제목과 내용을 입력해주세요.');
    }
    await noticeRepository.create(data);
    req.flash('success', '공지사항이 등록되었습니다.');
    return res.redirect('/admin/notices');
  },

  async showNoticeEdit(req, res) {
    const notice = await noticeRepository.findById(req.params.id);
    if (!notice) return res.status(404).render('error', { title: '공지사항을 찾을 수 없습니다', message: '존재하지 않는 공지사항입니다.' });
    return res.render('admin/notices/form', { title: '공지사항 수정', mode: 'edit', notice, error: null });
  },

  async updateNotice(req, res) {
    const existing = await noticeRepository.findById(req.params.id);
    if (!existing) return res.status(404).render('error', { title: '공지사항을 찾을 수 없습니다', message: '존재하지 않는 공지사항입니다.' });
    const data = normalizeNoticeBody(req.body);
    if (!data.title || !data.content) {
      return formError(res, 'admin/notices/form', { title: '공지사항 수정', mode: 'edit', notice: { ...existing, ...req.body } }, '제목과 내용을 입력해주세요.');
    }
    await noticeRepository.update(req.params.id, data);
    req.flash('success', '공지사항이 수정되었습니다.');
    return res.redirect('/admin/notices');
  },

  async toggleNotice(req, res) {
    await noticeRepository.toggleVisibility(req.params.id);
    req.flash('success', '공지사항 공개 상태가 변경되었습니다.');
    return res.redirect('/admin/notices');
  }
};

function normalizeAssignmentBody(body) {
  return {
    week: positiveInteger(body.week),
    title: required(body.title),
    topic: required(body.topic),
    description: required(body.description),
    recommendedChannel: required(body.recommended_channel),
    startAt: toSqlDateTime(body.start_at),
    dueAt: toSqlDateTime(body.due_at),
    isVisible: body.is_visible === '1' || body.is_visible === 'on',
    targetScope: body.target_scope === 'ALL' ? 'ALL' : 'SELECTED',
    artistIds: toArray(body.artist_ids).map((id) => positiveInteger(id)).filter(Boolean)
  };
}

function validateAssignment(data) {
  if (!data.week || !data.title || !data.topic) return '주차, 과제 제목, 과제 주제를 입력해주세요.';
  if (!isValidDateTime(data.startAt.replace(' ', 'T')) || !isValidDateTime(data.dueAt.replace(' ', 'T'))) return '제출 시작일과 마감일을 올바르게 입력해주세요.';
  if (new Date(data.startAt).getTime() >= new Date(data.dueAt).getTime()) return '마감일은 제출 시작일 이후여야 합니다.';
  return null;
}

function normalizeNoticeBody(body) {
  return {
    title: required(body.title),
    content: required(body.content),
    isPinned: body.is_pinned === '1' || body.is_pinned === 'on',
    isVisible: body.is_visible !== '0',
    publishedAt: toSqlDateTime(body.published_at) || null
  };
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function isDuplicateWeekError(error) {
  return error?.code === 'SQLITE_CONSTRAINT_UNIQUE'
    || (error?.code === 'ERR_SQLITE_ERROR' && String(error.message || '').includes('UNIQUE constraint failed: assignments.week'));
}
