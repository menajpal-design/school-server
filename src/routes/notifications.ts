import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getNotifications, markAsRead, markAllRead, createNotification } from '../controllers/notification';

const router = express.Router();

router.use(authenticate);

router.get('/', getNotifications);
router.post('/mark-read', markAsRead);
router.post('/mark-all', markAllRead);

// Admin/create route
router.post('/', authorize('head', 'assistant_head', 'staff'), createNotification);

export default router;
