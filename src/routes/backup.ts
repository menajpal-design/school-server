import express from 'express';
import { authenticate } from '../middleware/auth';
import BackupConfig from '../models/BackupConfig';
import User from '../models/User';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import Attendance from '../models/Attendance';
import Fee from '../models/Fee';
import Document from '../models/Document';
import IDCard from '../models/IDCard';
import Institution from '../models/Institution';
import Notice from '../models/Notice';
import Class from '../models/Class';
import Subject from '../models/Subject';
import Exam from '../models/Exam';
import Result from '../models/Result';

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

// Export data
router.get('/export', authenticate, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const collections = req.query.collections ? (req.query.collections as string).split(',') : ['students', 'teachers', 'staff', 'users', 'attendance', 'finance', 'documents', 'idcards', 'notices', 'classes', 'subjects', 'exams', 'results'];

    const data: any = {
      institution: await Institution.findById(institutionId),
      exportedAt: new Date(),
      collections: {},
    };

    if (collections.includes('students')) data.collections.students = await Student.find({ institutionId });
    if (collections.includes('teachers')) data.collections.teachers = await Teacher.find({ institutionId });
    if (collections.includes('staff')) data.collections.staff = await Staff.find({ institutionId });
    if (collections.includes('users')) data.collections.users = await User.find({ institutionId });
    if (collections.includes('attendance')) data.collections.attendance = await Attendance.find({ institutionId });
    if (collections.includes('finance')) data.collections.finance = await Fee.find({ institutionId });
    if (collections.includes('documents')) data.collections.documents = await Document.find({ institutionId });
    if (collections.includes('idcards')) data.collections.idcards = await IDCard.find({ institutionId });
    if (collections.includes('notices')) data.collections.notices = await Notice.find({ institutionId });
    if (collections.includes('classes')) data.collections.classes = await Class.find({ institutionId });
    if (collections.includes('subjects')) data.collections.subjects = await Subject.find({ institutionId });
    if (collections.includes('exams')) data.collections.exams = await Exam.find({ institutionId });
    if (collections.includes('results')) data.collections.results = await Result.find({ institutionId });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Export failed', error });
  }
});

// Import data
router.post('/import', authenticate, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const data = req.body;
    const results: any = {};

    // Import in order to avoid reference issues
    const importOrder = ['classes', 'subjects', 'users', 'teachers', 'staff', 'students', 'attendance', 'finance', 'documents', 'idcards', 'notices', 'exams', 'results'];

    for (const collection of importOrder) {
      if (data.collections && data.collections[collection]) {
        const Model = getModel(collection);
        if (Model) {
          const items = data.collections[collection];
          results[collection] = { imported: 0, skipped: 0 };

          for (const item of items) {
            try {
              // Add institutionId if not present
              if (!item.institutionId) item.institutionId = institutionId;

              // Check if exists (by _id or unique field)
              let existing = null;
              if (item._id) {
                existing = await Model.findById(item._id);
              }

              if (existing) {
                // Update existing
                await Model.findByIdAndUpdate(item._id, item);
                results[collection].skipped++;
              } else {
                // Create new
                delete item._id; // Let Mongo generate new ID
                await Model.create(item);
                results[collection].imported++;
              }
            } catch (err) {
              console.error(`Error importing ${collection} item:`, err);
            }
          }
        }
      }
    }

    res.json({ message: 'Import completed', results });
  } catch (error) {
    res.status(500).json({ message: 'Import failed', error });
  }
});

function getModel(collection: string) {
  switch (collection) {
    case 'students': return Student;
    case 'teachers': return Teacher;
    case 'staff': return Staff;
    case 'users': return User;
    case 'attendance': return Attendance;
    case 'finance': return Fee;
    case 'documents': return Document;
    case 'idcards': return IDCard;
    case 'notices': return Notice;
    case 'classes': return Class;
    case 'subjects': return Subject;
    case 'exams': return Exam;
    case 'results': return Result;
    default: return null;
  }
}

export default router;
