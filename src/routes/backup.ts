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

const collectionMap: Record<string, any> = {
  students: Student,
  teachers: Teacher,
  staff: Staff,
  classes: Class,
  sections: Section,
  subjects: Subject,
  attendance: Attendance,
  parents: Parent,
  fees: Fee,
  notices: Notice,
  idcards: IDCard,
  exams: Exam,
  classroutines: ClassRoutine,
};

const collectionAliases: Record<string, string> = {
  student: 'students', students: 'students',
  teacher: 'teachers', teachers: 'teachers',
  staff: 'staff',
  class: 'classes', classes: 'classes',
  section: 'sections', sections: 'sections',
  subject: 'subjects', subjects: 'subjects',
  attendance: 'attendance', attendances: 'attendance',
  parent: 'parents', parents: 'parents',
  fee: 'fees', fees: 'fees',
  notice: 'notices', notices: 'notices',
  idcard: 'idcards', idcards: 'idcards',
  exam: 'exams', exams: 'exams',
  classroutine: 'classroutines', classroutines: 'classroutines',
};

const normalizeCollectionName = (name: string): string => String(name || '').trim().toLowerCase().replace(/[-_\s]+/g, '');

function replaceContext(value: any, req: any): any {
  if (value === '__CURRENT_INSTITUTION_ID__') return req.user.institutionId;
  if (value === '__CURRENT_HEAD_USER_ID__') return req.user._id;
  if (Array.isArray(value)) return value.map((item: any): any => replaceContext(item, req));
  if (value && typeof value === 'object') {
    const next: any = {};
    for (const [key, val] of Object.entries(value)) next[key] = replaceContext(val, req);
    return next;
  }
  return value;
}

function prepareDoc(raw: any, req: any): any {
  const doc = replaceContext({ ...(raw || {}) }, req);
  doc.institutionId = req.user.institutionId;
  return doc;
}

async function importCollection(name: string, docs: any[], req: any): Promise<any> {
  const normalized = collectionAliases[normalizeCollectionName(name)] || name;
  const Model = collectionMap[normalized];
  if (!Model) return { collection: name, imported: 0, skipped: docs?.length || 0, reason: 'Unsupported or protected collection' };
  if (!Array.isArray(docs)) return { collection: normalized, imported: 0, skipped: 0, reason: 'No array data found' };

  let imported = 0;
  let skipped = 0;
  for (const raw of docs) {
    const doc = prepareDoc(raw, req);
    if (!doc._id) {
      await Model.create(doc);
      imported += 1;
      continue;
    }
    await Model.findOneAndUpdate(
      { _id: doc._id, institutionId: req.user.institutionId },
      { $set: doc },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    imported += 1;
  }
  return { collection: normalized, imported, skipped };
}

router.get('/export', authenticate, async (req: any, res) => {
  try {
    const requested = String(req.query.collections || 'students,teachers,staff')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const collections = requested.length ? requested : ['students', 'teachers', 'staff'];
    const data: Record<string, any[]> = {};

    for (const name of collections) {
      const normalized = collectionAliases[normalizeCollectionName(name)] || name;
      const Model = collectionMap[normalized];
      if (!Model) continue;
      data[normalized] = await Model.find({ institutionId: req.user.institutionId }).lean();
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
    const body = req.body || {};
    const data = body.data && typeof body.data === 'object' ? body.data : body;
    const requestedCollections = Array.isArray(body.collections) ? body.collections : Object.keys(data || {});
    const results: any[] = [];

    for (const name of requestedCollections) {
      const normalized = collectionAliases[normalizeCollectionName(name)] || name;
      const docs = data[name] || data[normalized] || [];
      results.push(await importCollection(normalized, docs, req));
    }

    const totalImported = results.reduce((sum: number, item: any) => sum + Number(item.imported || 0), 0);
    const totalSkipped = results.reduce((sum: number, item: any) => sum + Number(item.skipped || 0), 0);

    res.json({
      message: 'Backup data imported successfully. Existing Head and Institution were kept unchanged. Protected user login data is not restored by this endpoint.',
      imported: totalImported,
      skipped: totalSkipped,
      results,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to import backup data', error: error?.message || error });
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

    // Simple import - just create new records
    const importOrder = ['classes', 'subjects', 'users', 'teachers', 'staff', 'students', 'attendance', 'finance', 'documents', 'idcards', 'notices', 'exams', 'results'];

    for (const collection of importOrder) {
      if (data.collections && data.collections[collection]) {
        const Model = getModel(collection);
        if (Model) {
          const items = data.collections[collection];
          results[collection] = { imported: 0, errors: 0 };

          for (const item of items) {
            try {
              // Add institutionId if not present
              if (!item.institutionId) item.institutionId = institutionId;

              // Always create new (avoid conflicts)
              delete item._id; // Let Mongo generate new ID
              await new (Model as any)(item).save();
              results[collection].imported++;
            } catch (err) {
              console.error(`Error importing ${collection} item:`, err);
              results[collection].errors++;
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
