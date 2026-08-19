import { artistRepository } from '../repositories/artistRepository.js';
import { assignmentRepository } from '../repositories/assignmentRepository.js';
import { noticeRepository } from '../repositories/noticeRepository.js';
import { submissionRepository } from '../repositories/submissionRepository.js';
import { DEFAULT_ARTIST_PASSWORD, hashArtistPassword } from '../utils/artistAuth.js';
import { createAccessToken } from '../utils/tokens.js';
import { isValidDateTime, isValidUrl, required } from '../utils/validation.js';
import { localNextPath, toSqlDateTime } from '../utils/http.js';

const CHANNELS = ['Instagram', 'YouTube', 'Blog', 'TikTok', '기타'];
const ARTIST_STATUSES = ['ACTIVE', 'INACTIVE', 'COMPLETED'];
const SOCIAL_PLATFORMS = ['Instagram', 'YouTube', 'TikTok', 'Blog', 'X', 'Facebook', '기타'];
const SUBMITTED_STATUSES = new Set(['SUBMITTED', 'CONFIRMED']);
const ADMIN_PAGE_SIZE = 10;

function formError(res, view, data, message, status = 422) {
  return res.status(status).render(view, { ...data, error: message });
}

function createPagination(
  totalItems,
  requestedPage,
  path,
  query = {},
  pageSize = ADMIN_PAGE_SIZE,
  pageParam = 'page'
) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const parsedPage = Number.parseInt(requestedPage, 10);
  const page = Math.min(Math.max(Number.isInteger(parsedPage) ? parsedPage : 1, 1), totalPages);
  const offset = (page - 1) * pageSize;
  const pageUrl = (targetPage) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) params.set(key, String(value));
    });
    params.set(pageParam, String(targetPage));
    return `${path}?${params.toString()}`;
  };

  return {
    page,
    totalPages,
    totalItems,
    perPage: pageSize,
    offset,
    startItem: totalItems ? offset + 1 : 0,
    endItem: Math.min(offset + pageSize, totalItems),
    previousUrl: page > 1 ? pageUrl(page - 1) : null,
    nextUrl: page < totalPages ? pageUrl(page + 1) : null
  };
}

function findCurrentAssignment(assignments) {
  const now = Date.now();
  const started = assignments.filter((assignment) => new Date(assignment.start_at).getTime() <= now);
  return assignments.find((assignment) => {
    const start = new Date(assignment.start_at).getTime();
    const due = new Date(assignment.due_at).getTime();
    return start <= now && due >= now;
  }) || [...started].reverse()[0] || null;
}

function paginateAssignments(assignments, requestedPage, query = {}) {
  const groups = [];
  const groupsByRound = new Map();
  for (const assignment of assignments) {
    let group = groupsByRound.get(assignment.round_no);
    if (!group) {
      group = { roundNo: assignment.round_no, assignments: [] };
      groupsByRound.set(assignment.round_no, group);
      groups.push(group);
    }
    group.assignments.push(assignment);
  }

  groups.reverse();
  const totalItems = groups.length;
  const pagination = createPagination(totalItems, requestedPage, '/admin/progress', query);
  const pageGroups = groups.slice(pagination.offset, pagination.offset + pagination.perPage);

  return {
    assignments: pageGroups.flatMap((group) => group.assignments),
    pagination
  };
}

function buildDashboard(rows, assignments, query, currentAssignment = undefined) {
  const artists = new Map();

  for (const row of rows) {
    if (!artists.has(row.artist_id)) {
      artists.set(row.artist_id, {
        id: row.artist_id,
        name: row.artist_name,
        status: row.artist_status,
        assignments: new Map()
      });
    }
    const applicable = Number(row.is_applicable) === 1;
    artists.get(row.artist_id).assignments.set(row.assignment_id, {
      assignmentId: row.assignment_id,
      roundNo: row.round_no,
      applicable,
      status: applicable ? row.status || 'NOT_SUBMITTED' : 'NOT_APPLICABLE',
      postUrl: row.post_url,
      postUrls: row.post_urls || [],
      submittedAt: row.submitted_at
    });
  }

  const now = Date.now();
  const targetAssignments = assignments.filter((assignment) => new Date(assignment.start_at).getTime() <= now);
  const current = currentAssignment === undefined ? findCurrentAssignment(assignments) : currentAssignment;

  const assignmentGroups = [];
  for (const assignment of assignments) {
    let group = assignmentGroups.find((item) => item.roundNo === assignment.round_no);
    if (!group) {
      group = { roundNo: assignment.round_no, assignments: [], isCurrent: false };
      assignmentGroups.push(group);
    }
    group.assignments.push(assignment);
  }
  assignmentGroups.forEach((group) => {
    group.isCurrent = group.assignments.some((assignment) => assignment.id === current?.id);
  });

  const artistRows = [...artists.values()].map((artist) => {
    const assignmentStatuses = assignments.map((assignment) => artist.assignments.get(assignment.id) || {
      assignmentId: assignment.id,
      roundNo: assignment.round_no,
      applicable: false,
      status: 'NOT_APPLICABLE',
      postUrl: null,
      postUrls: []
    });
    const applicableAssignments = targetAssignments.filter((assignment) => artist.assignments.get(assignment.id)?.applicable);
    const submittedCount = applicableAssignments.filter((assignment) => {
      const status = artist.assignments.get(assignment.id)?.status;
      return SUBMITTED_STATUSES.has(status);
    }).length;
    const progressByRound = Object.fromEntries(assignmentGroups.map((group) => {
      const groupAssignments = group.assignments.filter((assignment) => artist.assignments.get(assignment.id)?.applicable);
      const groupSubmittedCount = groupAssignments.filter((assignment) => (
        SUBMITTED_STATUSES.has(artist.assignments.get(assignment.id)?.status)
      )).length;

      return [group.roundNo, {
        applicableCount: groupAssignments.length,
        submittedCount: groupSubmittedCount,
        progressRate: groupAssignments.length
          ? Math.round((groupSubmittedCount / groupAssignments.length) * 100)
          : 0
      }];
    }));
    return {
      ...artist,
      assignmentStatuses,
      progressByRound,
      progressRate: applicableAssignments.length ? Math.round((submittedCount / applicableAssignments.length) * 100) : 0,
      currentStatus: current && artist.assignments.get(current.id)?.applicable
        ? artist.assignments.get(current.id).status
        : 'NOT_APPLICABLE'
    };
  });

  assignmentGroups.forEach((group) => {
    const groupAssignmentIds = group.assignments.map((assignment) => assignment.id);
    const applicableAssignments = artistRows.flatMap((artist) => artist.assignmentStatuses)
      .filter((assignment) => groupAssignmentIds.includes(assignment.assignmentId) && assignment.applicable);
    group.applicableCount = applicableAssignments.length;
    group.submittedCount = applicableAssignments.filter((assignment) => SUBMITTED_STATUSES.has(assignment.status)).length;
    group.notSubmittedCount = group.applicableCount - group.submittedCount;
    group.progressRate = group.applicableCount
      ? Math.round((group.submittedCount / group.applicableCount) * 100)
      : 0;
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

function buildMonthlyOverview(dashboard) {
  const now = new Date();
  const sameMonth = (value) => {
    const date = new Date(value);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  };
  const missions = dashboard.assignmentGroups
    .filter((group) => sameMonth(group.assignments[0].start_at))
    .map((group) => {
      const mission = group.assignments[0];
      const start = new Date(mission.start_at);
      const due = new Date(mission.due_at);
      const state = start > now ? 'UPCOMING' : due < now ? 'ENDED' : 'IN_PROGRESS';
      return { ...group, mission, state };
    });
  const startedMissions = missions.filter((mission) => mission.state !== 'UPCOMING');
  const applicableCount = startedMissions.reduce((sum, mission) => sum + mission.applicableCount, 0);
  const submittedCount = startedMissions.reduce((sum, mission) => sum + mission.submittedCount, 0);

  return {
    monthLabel: `${now.getMonth() + 1}월`,
    missions,
    totalCount: missions.length,
    inProgressCount: missions.filter((mission) => mission.state === 'IN_PROGRESS').length,
    endedCount: missions.filter((mission) => mission.state === 'ENDED').length,
    upcomingCount: missions.filter((mission) => mission.state === 'UPCOMING').length,
    submittedCount,
    applicableCount,
    missingCount: applicableCount - submittedCount,
    progressRate: applicableCount ? Math.round((submittedCount / applicableCount) * 100) : 0,
    activeArtistCount: dashboard.artists.length
  };
}

export const adminController = {
  async dashboard(req, res) {
    const [assignments, rows, recentSubmissions, notices] = await Promise.all([
      assignmentRepository.list({ includeHidden: false }),
      submissionRepository.dashboardRows(),
      submissionRepository.list({ limit: 5, offset: 0 }),
      noticeRepository.list({ includeHidden: true, limit: 3, offset: 0 })
    ]);
    const dashboard = buildDashboard(rows, assignments, req.query);
    dashboard.monthly = buildMonthlyOverview(dashboard);
    dashboard.monthly.pagination = createPagination(
      dashboard.monthly.missions.length,
      req.query.mission_page,
      '/admin/dashboard',
      { artist_page: req.query.artist_page || '' },
      20,
      'mission_page'
    );
    dashboard.monthly.missions = dashboard.monthly.missions.slice(
      dashboard.monthly.pagination.offset,
      dashboard.monthly.pagination.offset + dashboard.monthly.pagination.perPage
    );
    dashboard.artistPagination = createPagination(
      dashboard.artists.length,
      req.query.artist_page,
      '/admin/dashboard',
      { mission_page: req.query.mission_page || '' },
      20,
      'artist_page'
    );
    dashboard.artists = dashboard.artists.slice(
      dashboard.artistPagination.offset,
      dashboard.artistPagination.offset + dashboard.artistPagination.perPage
    );
    return res.render('admin/dashboard', {
      title: '대시보드',
      dashboard,
      recentSubmissions,
      notices
    });
  },

  async assignmentProgress(req, res) {
    const allAssignments = await assignmentRepository.list({ includeHidden: false });
    const { assignments, pagination } = paginateAssignments(allAssignments, req.query.page, {
      search: req.query.search || ''
    });
    const rows = assignments.length
      ? await submissionRepository.dashboardRows({ assignmentIds: assignments.map((assignment) => assignment.id) })
      : [];
    const dashboard = buildDashboard(rows, assignments, req.query, findCurrentAssignment(allAssignments));
    dashboard.pagination = pagination;
    return res.render('admin/progress/index', { title: '미션 진행 현황', dashboard });
  },

  async artists(req, res) {
    const filters = { search: req.query.search || '', status: req.query.status || '' };
    const totalItems = await artistRepository.count(filters);
    const pagination = createPagination(totalItems, req.query.page, '/admin/artists', filters, 20);
    const artists = await artistRepository.list({ ...filters, limit: pagination.perPage, offset: pagination.offset });
    return res.render('admin/artists/index', {
      title: '작가 관리', artists, filters, statuses: ARTIST_STATUSES, pagination
    });
  },

  showArtistCreate(req, res) {
    return res.render('admin/artists/form', {
      title: '작가 등록',
      mode: 'create',
      artist: { name: '', phone: '', status: 'ACTIVE', links: [{ platform: 'Instagram', url: '' }] },
      statuses: ARTIST_STATUSES,
      platforms: SOCIAL_PLATFORMS,
      error: null
    });
  },

  async createArtist(req, res) {
    const name = required(req.body.name);
    const linkForm = normalizeArtistLinks(req.body);
    const artistForm = { ...req.body, links: linkForm.links };
    if (!name) {
      return formError(res, 'admin/artists/form', {
        title: '작가 등록', mode: 'create', artist: artistForm, statuses: ARTIST_STATUSES, platforms: SOCIAL_PLATFORMS
      }, '작가명을 입력해주세요.');
    }
    if (linkForm.error) {
      return formError(res, 'admin/artists/form', {
        title: '작가 등록', mode: 'create', artist: artistForm, statuses: ARTIST_STATUSES, platforms: SOCIAL_PLATFORMS
      }, linkForm.error);
    }
    if (await artistRepository.findByName(name)) {
      return formError(res, 'admin/artists/form', {
        title: '작가 등록', mode: 'create', artist: artistForm, statuses: ARTIST_STATUSES, platforms: SOCIAL_PLATFORMS
      }, '이미 사용 중인 작가명입니다. 작가명이 로그인 아이디로 사용됩니다.');
    }

    const { tokenHash } = createAccessToken();
    const passwordHash = await hashArtistPassword(DEFAULT_ARTIST_PASSWORD);
    const artist = await artistRepository.create({
      name,
      phone: required(req.body.phone),
      status: ARTIST_STATUSES.includes(req.body.status) ? req.body.status : 'ACTIVE',
      tokenHash,
      passwordHash,
      links: linkForm.links
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
      title: '작가 수정', mode: 'edit', artist, statuses: ARTIST_STATUSES, platforms: SOCIAL_PLATFORMS, error: null
    });
  },

  async updateArtist(req, res) {
    const existing = await artistRepository.findById(req.params.id);
    if (!existing) return res.status(404).render('error', { title: '작가를 찾을 수 없습니다', message: '존재하지 않는 작가입니다.' });
    const name = required(req.body.name);
    const status = ARTIST_STATUSES.includes(req.body.status) ? req.body.status : 'ACTIVE';
    const linkForm = normalizeArtistLinks(req.body);
    const artistForm = { ...existing, ...req.body, links: linkForm.links };
    if (!name) {
      return formError(res, 'admin/artists/form', {
        title: '작가 수정', mode: 'edit', artist: artistForm, statuses: ARTIST_STATUSES, platforms: SOCIAL_PLATFORMS
      }, '작가명을 입력해주세요.');
    }
    if (linkForm.error) {
      return formError(res, 'admin/artists/form', {
        title: '작가 수정', mode: 'edit', artist: artistForm, statuses: ARTIST_STATUSES, platforms: SOCIAL_PLATFORMS
      }, linkForm.error);
    }
    if (await artistRepository.findOtherByName(name, req.params.id)) {
      return formError(res, 'admin/artists/form', {
        title: '작가 수정', mode: 'edit', artist: artistForm, statuses: ARTIST_STATUSES, platforms: SOCIAL_PLATFORMS
      }, '이미 사용 중인 작가명입니다. 작가명이 로그인 아이디로 사용됩니다.');
    }
    await artistRepository.update(req.params.id, {
      name,
      phone: required(req.body.phone),
      status,
      links: linkForm.links
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

  async deleteArtist(req, res) {
    const artist = await artistRepository.findById(req.params.id);
    if (!artist) return res.status(404).render('error', { title: '작가를 찾을 수 없습니다', message: '존재하지 않는 작가입니다.' });
    await artistRepository.delete(artist.id);
    req.flash('success', `${artist.name} 작가와 관련 제출 내역이 삭제되었습니다.`);
    return res.redirect('/admin/artists');
  },

  async assignments(req, res) {
    const totalItems = await assignmentRepository.count({ includeHidden: true });
    const pagination = createPagination(totalItems, req.query.page, '/admin/assignments');
    const assignments = await assignmentRepository.list({
      includeHidden: true, limit: pagination.perPage, offset: pagination.offset, order: 'desc'
    });
    return res.render('admin/assignments/index', { title: '미션 관리', assignments, pagination });
  },

  async showAssignmentCreate(req, res) {
    const nextRoundNo = await assignmentRepository.nextRoundNo();
    return res.render('admin/assignments/form', {
      title: '미션 등록', mode: 'create', assignment: {
        round_no: nextRoundNo, title: '', topic: '', description: '', recommended_channel: '',
        start_at: '', due_at: '', is_visible: 0, target_scope: 'ALL'
      }, channels: CHANNELS, error: null
    });
  },

  async createAssignment(req, res) {
    const data = normalizeAssignmentBody(req.body);
    const error = validateAssignment(data);
    const nextRoundNo = await assignmentRepository.nextRoundNo();
    const assignment = { ...req.body, round_no: nextRoundNo };
    if (error) return formError(res, 'admin/assignments/form', { title: '미션 등록', mode: 'create', assignment, channels: CHANNELS }, error);
    await assignmentRepository.create(data);
    req.flash('success', '미션이 등록되었습니다.');
    return res.redirect('/admin/assignments');
  },

  async showAssignmentEdit(req, res) {
    const assignment = await assignmentRepository.findById(req.params.id);
    if (!assignment) return res.status(404).render('error', { title: '미션을 찾을 수 없습니다', message: '존재하지 않는 미션입니다.' });
    return res.render('admin/assignments/form', { title: '미션 수정', mode: 'edit', assignment, channels: CHANNELS, error: null });
  },

  async updateAssignment(req, res) {
    const existing = await assignmentRepository.findById(req.params.id);
    if (!existing) return res.status(404).render('error', { title: '미션을 찾을 수 없습니다', message: '존재하지 않는 미션입니다.' });
    const data = normalizeAssignmentBody(req.body);
    const error = validateAssignment(data);
    if (error) return formError(res, 'admin/assignments/form', { title: '미션 수정', mode: 'edit', assignment: { ...existing, ...req.body }, channels: CHANNELS }, error);
    await assignmentRepository.update(req.params.id, data);
    req.flash('success', '미션이 수정되었습니다.');
    return res.redirect('/admin/assignments');
  },

  async toggleAssignment(req, res) {
    await assignmentRepository.toggleVisibility(req.params.id);
    req.flash('success', '미션 공개 상태가 변경되었습니다.');
    return res.redirect('/admin/assignments');
  },

  async deleteAssignment(req, res) {
    const assignment = await assignmentRepository.findById(req.params.id);
    if (!assignment) return res.status(404).render('error', { title: '미션을 찾을 수 없습니다', message: '존재하지 않는 미션입니다.' });
    await assignmentRepository.delete(assignment.id);
    req.flash('success', `미션 ${assignment.round_no}과 관련 제출 내역이 삭제되었습니다.`);
    return res.redirect('/admin/assignments');
  },

  async submissions(req, res) {
    const filters = {
      search: req.query.search || '', status: req.query.status || '',
      assignmentId: req.query.assignment_id || '', channel: req.query.channel || ''
    };
    const [totalItems, assignments] = await Promise.all([
      submissionRepository.count(filters),
      assignmentRepository.list({ includeHidden: true })
    ]);
    const pagination = createPagination(totalItems, req.query.page, '/admin/submissions', {
      search: filters.search,
      status: filters.status,
      assignment_id: filters.assignmentId,
      channel: filters.channel
    });
    const submissions = await submissionRepository.list({
      ...filters, limit: pagination.perPage, offset: pagination.offset
    });
    return res.render('admin/submissions/index', {
      title: '제출 내역', submissions, assignments, filters, channels: CHANNELS, pagination
    });
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
    const totalItems = await noticeRepository.count({ includeHidden: true });
    const pagination = createPagination(totalItems, req.query.page, '/admin/notices');
    const notices = await noticeRepository.list({
      includeHidden: true, limit: pagination.perPage, offset: pagination.offset
    });
    return res.render('admin/notices/index', { title: '공지사항', notices, pagination });
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
    const notice = await noticeRepository.create(data);
    req.flash('success', '공지사항이 등록되었습니다.');
    return res.redirect(`/admin/notices/${notice.id}`);
  },

  async noticeDetail(req, res) {
    const notice = await noticeRepository.findById(req.params.id);
    if (!notice) return res.status(404).render('error', { title: '공지사항을 찾을 수 없습니다', message: '존재하지 않는 공지사항입니다.' });
    return res.render('admin/notices/detail', { title: '공지사항 상세', notice });
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
    return res.redirect(`/admin/notices/${req.params.id}`);
  },

  async toggleNotice(req, res) {
    await noticeRepository.toggleVisibility(req.params.id);
    req.flash('success', '공지사항 공개 상태가 변경되었습니다.');
    return res.redirect(localNextPath(req.body.next, '/admin/notices'));
  },

  async deleteNotice(req, res) {
    const notice = await noticeRepository.findById(req.params.id);
    if (!notice) return res.status(404).render('error', { title: '공지사항을 찾을 수 없습니다', message: '존재하지 않는 공지사항입니다.' });
    await noticeRepository.delete(notice.id);
    req.flash('success', '공지사항이 삭제되었습니다.');
    return res.redirect('/admin/notices');
  }
};

function normalizeAssignmentBody(body) {
  return {
    title: required(body.title),
    topic: required(body.topic),
    description: required(body.description),
    recommendedChannel: required(body.recommended_channel),
    startAt: toSqlDateTime(body.start_at),
    dueAt: toSqlDateTime(body.due_at),
    isVisible: body.is_visible === '1' || body.is_visible === 'on'
  };
}

function normalizeArtistLinks(body) {
  const platforms = toArray(body.link_platform);
  const urls = toArray(body.link_url);
  const links = [];
  const length = Math.max(platforms.length, urls.length);

  for (let index = 0; index < length; index += 1) {
    const platform = required(platforms[index]);
    const url = required(urls[index]);
    if (!platform && !url) continue;
    if (!SOCIAL_PLATFORMS.includes(platform)) return { links, error: '플랫폼을 올바르게 선택해주세요.' };
    if (!isValidUrl(url)) return { links, error: '플랫폼 URL은 http:// 또는 https://로 시작해야 합니다.' };
    if (!links.some((link) => link.platform === platform && link.url === url)) links.push({ platform, url });
  }

  return { links, error: null };
}

function validateAssignment(data) {
  if (!data.title || !data.topic) return '미션 제목과 미션 주제를 입력해주세요.';
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
  return value === undefined || value === null ? [] : [value];
}
