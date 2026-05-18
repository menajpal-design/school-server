import { Request, Response } from 'express';
import Notification from '../models/Notification';

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const institutionId = req.user.institutionId;
    const recipientId = req.user._id;

    // Fetch both personal and broadcast (recipientId null) notifications
    const notifications = await Notification.find({
      institutionId,
      $or: [{ recipientId }, { recipientId: null }]
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch notifications', error });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const id = req.params.id || req.body.id;
    const institutionId = req.user.institutionId;
    if (!id) return res.status(400).json({ message: 'Notification id required' });

    const n = await Notification.findOneAndUpdate({ _id: id, institutionId }, { isRead: true }, { new: true });
    if (!n) return res.status(404).json({ message: 'Notification not found' });
    res.json({ success: true, notification: n });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark as read', error });
  }
};

export const markAllRead = async (req: Request, res: Response) => {
  try {
    const institutionId = req.user.institutionId;
    const recipientId = req.user._id;
    await Notification.updateMany({ institutionId, $or: [{ recipientId }, { recipientId: null }], isRead: false }, { isRead: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark all as read', error });
  }
};

export const createNotification = async (req: Request, res: Response) => {
  try {
    const { title, body, link, type, recipientId } = req.body;
    const institutionId = req.user.institutionId;
    if (!title) return res.status(400).json({ message: 'title required' });

    const n = await Notification.create({ title, body, link, type, recipientId: recipientId || null, institutionId });
    res.status(201).json(n);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create notification', error });
  }
};
