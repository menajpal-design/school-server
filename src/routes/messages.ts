import { Router, Request, Response } from 'express';
import Message from '../models/Message';
import { sendEmail, sendNotificationEmail } from '../services/emailService';
import { authenticate } from '../middleware/auth';

const router = Router();

// Get inbox messages
router.get('/inbox', authenticate, async (req: any, res: any) => {
  try {
    const messages = await Message.find({
      toUserId: req.user.id,
      folder: 'inbox',
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: messages,
      unreadCount: messages.filter((m) => !m.isRead).length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch inbox' });
  }
});

// Get sent messages
router.get('/sent', authenticate, async (req: any, res: any) => {
  try {
    const messages = await Message.find({
      fromUserId: req.user.id,
      folder: 'sent',
    }).sort({ createdAt: -1 });

    res.json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch sent messages' });
  }
});

// Get single message
router.get('/:id', authenticate, async (req: any, res: any) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Mark as read if recipient is viewing
    if (message.toUserId === req.user.id && !message.isRead) {
      message.isRead = true;
      message.readAt = new Date();
      await message.save();
    }

    res.json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch message' });
  }
});

// Send message (internal + email)
router.post('/send', authenticate, async (req: any, res: any) => {
  try {
    const { toUserId, toUserEmail, toUserName, subject, body, sendAsEmail } = req.body;

    if (!toUserId || !subject || !body) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: toUserId, subject, body',
      });
    }

    // Create database record
    const message = new Message({
      fromUserId: req.user.id,
      fromUserName: req.user.name,
      fromUserEmail: req.user.email,
      toUserId,
      toUserName,
      toUserEmail,
      subject,
      body,
      messageType: sendAsEmail ? 'email' : 'internal',
      folder: 'sent',
    });

    await message.save();

    // Also create an inbox record for recipient
    const inboxMessage = new Message({
      fromUserId: req.user.id,
      fromUserName: req.user.name,
      fromUserEmail: req.user.email,
      toUserId,
      toUserName,
      toUserEmail,
      subject,
      body,
      messageType: sendAsEmail ? 'email' : 'internal',
      folder: 'inbox',
    });

    await inboxMessage.save();

    // Send external email if requested
    if (sendAsEmail && toUserEmail) {
      const emailSuccess = await sendNotificationEmail(
        toUserEmail,
        toUserName,
        subject,
        body
      );

      if (!emailSuccess) {
        console.warn('Email send failed but message saved to database');
      }
    }

    res.json({
      success: true,
      message: 'Message sent successfully',
      data: message,
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// Mark message as read
router.patch('/:id/read', authenticate, async (req: any, res: any) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message || message.toUserId !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    message.isRead = true;
    message.readAt = new Date();
    await message.save();

    res.json({ success: true, message: 'Message marked as read', data: message });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update message' });
  }
});

// Delete message (move to trash)
router.delete('/:id', authenticate, async (req: any, res: any) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Only allow deletion by sender or recipient
    if (message.fromUserId !== req.user.id && message.toUserId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    message.folder = 'trash';
    await message.save();

    res.json({ success: true, message: 'Message moved to trash' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete message' });
  }
});

// Get unread count
router.get('/stats/unread', authenticate, async (req: any, res: any) => {
  try {
    const unreadCount = await Message.countDocuments({
      toUserId: req.user.id,
      isRead: false,
      folder: 'inbox',
    });

    res.json({ success: true, unreadCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
});

export default router;
