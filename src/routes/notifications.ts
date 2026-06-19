import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getNotifications, markAsRead, markAllRead, createNotification } from '../controllers/notification';

const router = express.Router();

router.use(authenticate);

router.get('/', getNotifications);
// IMPORTANT: /read-all must be registered BEFORE /:id/read to prevent route shadowing
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markAsRead);
router.post('/mark-read', markAsRead);
router.post('/mark-all', markAllRead);

// Admin/create route
router.post('/', authorize('admin', 'super_admin', 'head', 'assistant_head', 'staff'), createNotification);

export default router;
