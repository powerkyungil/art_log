import express from 'express';
import rateLimit from 'express-rate-limit';
import { adminAuthController } from '../controllers/adminAuthController.js';
import { adminController } from '../controllers/adminController.js';
import { requireAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.'
});

router.get('/login', adminAuthController.showLogin);
router.post('/login', loginLimiter, asyncHandler(adminAuthController.login));
router.post('/logout', requireAdmin, adminAuthController.logout);

router.use(requireAdmin);

router.get('/', (req, res) => res.redirect('/admin/dashboard'));
router.get('/dashboard', asyncHandler(adminController.dashboard));
router.get('/progress', asyncHandler(adminController.assignmentProgress));

router.get('/artists', asyncHandler(adminController.artists));
router.get('/artists/new', adminController.showArtistCreate);
router.post('/artists', asyncHandler(adminController.createArtist));
router.get('/artists/:id/edit', asyncHandler(adminController.showArtistEdit));
router.post('/artists/:id', asyncHandler(adminController.updateArtist));
router.post('/artists/:id/reset-password', asyncHandler(adminController.resetArtistPassword));
router.post('/artists/:id/delete', asyncHandler(adminController.deleteArtist));
router.get('/artists/:id', asyncHandler(adminController.artistDetail));

router.get('/assignments', asyncHandler(adminController.assignments));
router.get('/assignments/new', adminController.showAssignmentCreate);
router.post('/assignments', asyncHandler(adminController.createAssignment));
router.get('/assignments/:id/edit', asyncHandler(adminController.showAssignmentEdit));
router.post('/assignments/:id', asyncHandler(adminController.updateAssignment));
router.post('/assignments/:id/toggle', asyncHandler(adminController.toggleAssignment));
router.post('/assignments/:id/delete', asyncHandler(adminController.deleteAssignment));

router.get('/submissions', asyncHandler(adminController.submissions));
router.get('/submissions/:id', asyncHandler(adminController.submissionDetail));
router.post('/submissions/:id', asyncHandler(adminController.updateSubmission));

router.get('/notices', asyncHandler(adminController.notices));
router.get('/notices/new', adminController.showNoticeCreate);
router.post('/notices', asyncHandler(adminController.createNotice));
router.get('/notices/:id/edit', asyncHandler(adminController.showNoticeEdit));
router.post('/notices/:id', asyncHandler(adminController.updateNotice));
router.post('/notices/:id/toggle', asyncHandler(adminController.toggleNotice));
router.post('/notices/:id/delete', asyncHandler(adminController.deleteNotice));

export default router;
