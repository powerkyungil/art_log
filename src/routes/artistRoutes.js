import express from 'express';
import rateLimit from 'express-rate-limit';
import { artistController } from '../controllers/artistController.js';
import { requireArtist } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.'
});

router.get('/', artistController.landing);
router.post('/artist/login', loginLimiter, asyncHandler(artistController.login));

router.use('/artist', requireArtist);
router.get('/artist', asyncHandler(artistController.home));
router.post('/artist/logout', asyncHandler(artistController.logout));
router.get('/artist/password', asyncHandler(artistController.showPasswordChange));
router.post('/artist/password', asyncHandler(artistController.changePassword));
router.get('/artist/submissions/new', asyncHandler(artistController.showSubmissionForm));
router.post('/artist/submissions', asyncHandler(artistController.createSubmission));
router.get('/artist/submissions', asyncHandler(artistController.history));
router.get('/artist/submissions/:id/edit', asyncHandler(artistController.showEdit));
router.post('/artist/submissions/:id', asyncHandler(artistController.update));
router.get('/artist/submissions/:id/success', asyncHandler(artistController.success));

export default router;
