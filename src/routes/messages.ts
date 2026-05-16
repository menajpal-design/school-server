import express from 'express';
import { authenticate } from '../middleware/auth';
import Message from '../models/Message';

const router = express.Router();
router.use(authenticate);

router.get('/stats/unread', async (req: any, res) => {
  try {
    const unreadCount = await Message.countDocuments({ institutionId: req.user.institutionId, recipientId: req.user._id, isRead: false });
    res.json({ success: true, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load unread message count', error });
  }
});

router.get('/inbox', async (req: any, res) => {
  try {
    const messages = await Message.find({ institutionId: req.user.institutionId, recipientId: req.user._id })
      .populate('senderId', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load inbox', error });
  }
});

router.get('/sent', async (req: any, res) => {
  try {
    const messages = await Message.find({ institutionId: req.user.institutionId, senderId: req.user._id })
      .populate('recipientId', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load sent messages', error });
  }
});

router.post('/send', async (req: any, res) => {
  try {
    if (!req.body.recipientId || !req.body.subject || !req.body.body) {
      return res.status(400).json({ message: 'Recipient, subject and message body are required.' });
    }
    const message = await Message.create({
      senderId: req.user._id,
      recipientId: req.body.recipientId,
      subject: req.body.subject,
      body: req.body.body,
      institutionId: req.user.institutionId,
    });
    res.status(201).json({ message });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send message', error });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const message = await Message.findOne({ _id: req.params.id, institutionId: req.user.institutionId, $or: [{ senderId: req.user._id }, { recipientId: req.user._id }] })
      .populate('senderId', 'name email role')
      .populate('recipientId', 'name email role')
      .lean();
    if (!message) return res.status(404).json({ message: 'Message not found' });
    res.json({ message });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load message', error });
  }
});

router.patch('/:id/read', async (req: any, res) => {
  try {
    const message = await Message.findOneAndUpdate(
      { _id: req.params.id, institutionId: req.user.institutionId, recipientId: req.user._id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!message) return res.status(404).json({ message: 'Message not found' });
    res.json({ message });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark message as read', error });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const message = await Message.findOneAndDelete({ _id: req.params.id, institutionId: req.user.institutionId, $or: [{ senderId: req.user._id }, { recipientId: req.user._id }] });
    if (!message) return res.status(404).json({ message: 'Message not found' });
    res.json({ message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete message', error });
  }
});

export default router;
