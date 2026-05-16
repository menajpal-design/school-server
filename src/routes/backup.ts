import express from 'express';
import { authenticate } from '../middleware/auth';
import BackupConfig from '../models/BackupConfig';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import Class from '../models/Class';
import Section from '../models/Section';
import Subject from '../models/Subject';
import Attendance from '../models/Attendance';
import Parent from '../models/Parent';
import Fee from '../models/Fee';
import Notice from '../models/Notice';
import IDCard from '../models/IDCard';
import Exam from '../models/Exam';
import ClassRoutine from '../models/ClassRoutine';

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

export default router;