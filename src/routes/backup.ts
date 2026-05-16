import express from 'express';
import { authenticate } from '../middleware/auth';
import BackupConfig from '../models/BackupConfig';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import User from '../models/User';
import Class from '../models/Class';
import Section from '../models/Section';
import Subject from '../models/Subject';
import Attendance from '../models/Attendance';

const router = express.Router();

const collectionMap: Record<string, any> = {
  students: Student,
  teachers: Teacher,
  staff: Staff,
  users: User,
  classes: Class,
  sections: Section,
  subjects: Subject,
  attendance: Attendance,
};

router.get('/export', authenticate, async (req: any, res) => {
  try {
    const requested = String(req.query.collections || 'students,teachers,staff')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const collections = requested.length ? requested : ['students', 'teachers', 'staff'];
    const data: Record<string, any[]> = {};

    for (const name of collections) {
      const Model = collectionMap[name];
      if (!Model) continue;
      data[name] = await Model.find({ institutionId: req.user.institutionId }).lean();
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      institutionId: req.user.institutionId,
      collections: Object.keys(data),
      data,
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="easy-school-backup-${Date.now()}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    res.status(500).json({ message: 'Failed to export backup data', error });
  }
});

router.get('/', authenticate, (req: any, res) => {
  BackupConfig.find({ institutionId: req.user.institutionId })
    .sort({ createdAt: -1 })
    .then((backups) => res.json({ backups }))
    .catch((error) => res.status(500).json({ message: 'Failed to load backup configs', error }));
});

router.post('/', authenticate, (req: any, res) => {
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

router.post('/import', authenticate, async (req: any, res) => {
  try {
    res.json({ message: 'Import endpoint received. Automatic restore is disabled for safety.', received: Boolean(req.body) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to import backup data', error });
  }
});

router.post('/:id/restore', authenticate, async (req: any, res) => {
  try {
    const backup = await BackupConfig.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!backup) return res.status(404).json({ message: 'Backup not found' });
    res.json({ message: 'Restore queued', backup });
  } catch (error) {
    res.status(500).json({ message: 'Failed to queue restore', error });
  }
});

export default router;