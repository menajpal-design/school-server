import express from 'express';
import ClassRoutine from '../models/ClassRoutine';
import Institution from '../models/Institution';
import { authenticate, canManageAcademic } from '../middleware/auth';

const router = express.Router();

const normalizeBody = (req: any) => ({
  classId: req.body.classId,
  sectionId: req.body.sectionId || undefined,
  subjectId: req.body.subjectId || undefined,
  teacherId: req.body.teacherId || undefined,
  dayOfWeek: req.body.dayOfWeek,
  periodName: req.body.periodName,
  startTime: req.body.startTime,
  endTime: req.body.endTime,
  room: req.body.room,
  note: req.body.note,
  isActive: req.body.isActive !== false,
  isPublic: req.body.isPublic === true,
  institutionId: req.user.institutionId,
  createdBy: req.user._id,
});

const populateRoutine = () =>
  ClassRoutine.find()
    .populate('classId', 'name grade academicYear')
    .populate('sectionId', 'name')
    .populate('subjectId', 'name code')
    .populate('teacherId', 'name email phone role')
    .populate('createdBy', 'name role');

router.get('/public', async (req, res) => {
  try {
    let institution: any = null;
    if (req.query.institutionId) {
      institution = await Institution.findOne({ _id: req.query.institutionId, isActive: true });
    } else {
      const domain = String(req.query.domain || req.hostname || '').replace(/^www\./, '').toLowerCase();
      if (domain) {
        institution = await Institution.findOne({
          isActive: true,
          $or: [
            { website: new RegExp(domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
            { domains: domain },
            { domains: `www.${domain}` },
          ],
        });
      }
    }

    if (!institution) return res.status(404).json({ message: 'School not found' });

    const query: any = { institutionId: institution._id, isPublic: true, isActive: true };
    if (req.query.classId) query.classId = req.query.classId;
    if (req.query.sectionId) query.sectionId = req.query.sectionId;

    const routines = await populateRoutine().where(query).sort({ dayOfWeek: 1, startTime: 1 }).lean();
    res.json({
      institution: {
        id: institution._id,
        name: institution.name,
        address: institution.address,
        phone: institution.phone,
        email: institution.email,
      },
      routines,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load public class routine', error });
  }
});

router.use(authenticate);
router.use(canManageAcademic());

router.get('/', async (req, res) => {
  try {
    const query: any = { institutionId: req.user.institutionId };
    if (req.query.classId) query.classId = req.query.classId;
    if (req.query.sectionId) query.sectionId = req.query.sectionId;
    if (req.query.dayOfWeek) query.dayOfWeek = req.query.dayOfWeek;

    const routines = await populateRoutine().where(query).sort({ dayOfWeek: 1, startTime: 1 }).lean();
    res.json({ routines });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load class routines', error });
  }
});

router.post('/', async (req, res) => {
  try {
    const routine = await ClassRoutine.create(normalizeBody(req));
    const created = await populateRoutine().where({ _id: routine._id, institutionId: req.user.institutionId }).findOne();
    res.status(201).json({ routine: created, message: 'Class routine created' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create class routine', error });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const routine = await ClassRoutine.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!routine) return res.status(404).json({ message: 'Class routine not found' });

    Object.assign(routine, normalizeBody(req));
    await routine.save();

    const updated = await populateRoutine().where({ _id: routine._id, institutionId: req.user.institutionId }).findOne();
    res.json({ routine: updated, message: 'Class routine updated' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update class routine', error });
  }
});

router.patch('/:id/public', async (req, res) => {
  try {
    const routine = await ClassRoutine.findOneAndUpdate(
      { _id: req.params.id, institutionId: req.user.institutionId },
      { isPublic: req.body.isPublic === true },
      { new: true }
    );
    if (!routine) return res.status(404).json({ message: 'Class routine not found' });
    res.json({ routine, message: routine.isPublic ? 'Class routine is public' : 'Class routine is private' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update routine public status', error });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const routine = await ClassRoutine.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!routine) return res.status(404).json({ message: 'Class routine not found' });
    await routine.deleteOne();
    res.json({ message: 'Class routine deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete class routine', error });
  }
});

export default router;
