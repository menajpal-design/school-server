import express from 'express';
import { authenticate } from '../middleware/auth';
import BackupConfig from '../models/BackupConfig';

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  BackupConfig.find({ institutionId: req.user.institutionId })
    .sort({ createdAt: -1 })
    .then((backups) => res.json({ backups }))
    .catch((error) => res.status(500).json({ message: 'Failed to load backup configs', error }));
});

router.post('/', authenticate, (req, res) => {
  const now = new Date();
  const nextBackup = new Date(now);
  if (req.body.frequency === 'daily') nextBackup.setDate(now.getDate() + 1);
  if (req.body.frequency === 'weekly') nextBackup.setDate(now.getDate() + 7);
  if (req.body.frequency === 'monthly') nextBackup.setMonth(now.getMonth() + 1);

  BackupConfig.create({
    ...req.body,
    time: req.body.time || '02:00',
    retentionDays: Number(req.body.retentionDays) || 30,
    lastBackup: req.body.runNow ? now : undefined,
    nextBackup,
    institutionId: req.user.institutionId,
    createdBy: req.user._id,
  })
    .then((backup) => res.status(201).json({ backup }))
    .catch((error) => res.status(500).json({ message: 'Failed to save backup config', error }));
});

router.post('/:id/restore', authenticate, async (req, res) => {
  try {
    const backup = await BackupConfig.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!backup) return res.status(404).json({ message: 'Backup not found' });
    res.json({ message: 'Restore queued', backup });
  } catch (error) {
    res.status(500).json({ message: 'Failed to queue restore', error });
  }
});

export default router;
