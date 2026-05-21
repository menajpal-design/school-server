import express from 'express';
import { authenticate, canManageAcademic } from '../middleware/auth';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Student from '../models/Student';
import { getTenantStorageContext, runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();

const currentYear = () => new Date().getFullYear().toString();

const defaultSections = () => [{ name: 'A', capacity: 30, currentStudents: 0, isActive: true }];

const normalizeSections = (sections: any[] = []) =>
  sections
    .filter((section) => String(section?.name || '').trim())
    .map((section) => ({
      _id: section._id,
      name: String(section.name || '').trim(),
      capacity: Number(section.capacity) || 30,
      currentStudents: Number(section.currentStudents) || 0,
      isActive: section.isActive !== false,
    }));

const deriveGrade = (value: any) => {
  const text = String(value || '').trim();
  if (!text) return 'General';
  const digit = text.match(/\d+/)?.[0];
  return digit || text;
};

const normalizeShift = (value: any) => ['morning', 'day', 'evening'].includes(String(value)) ? String(value) : 'day';

const normalizeClassPayload = (item: any = {}, fallback: any = {}) => {
  const name = String(item.name || fallback.name || '').trim();
  return {
    name,
    grade: String(item.grade || fallback.grade || deriveGrade(name) || 'General').trim(),
    shift: normalizeShift(item.shift || fallback.shift),
    classTeacherId: item.classTeacherId || fallback.classTeacherId || undefined,
    academicYear: String(item.academicYear || fallback.academicYear || currentYear()).trim() || currentYear(),
    isActive: item.isActive !== false,
    sections: normalizeSections(item.sections || fallback.sections || defaultSections()),
  };
};

const normalizeBulkItems = (input: any) => {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.items)) return input.items;
  return null;
};

const readableError = (error: any) => {
  if (error?.name === 'ValidationError') {
    return Object.values(error.errors || {}).map((item: any) => item?.message).filter(Boolean).join(', ') || error.message;
  }
  if (error?.code === 11000) return 'Duplicate class data found. Please use a different class name/year.';
  if (error?.message?.includes('buffering timed out') || error?.message?.includes('ECONN') || error?.message?.includes('Mongo')) {
    return 'MongoDB connection problem. Company MongoDB URI is missing/invalid, so server tried fallback storage. Please check Settings > Storage Connection Status.';
  }
  return error?.message || 'Failed to save class.';
};

const populateClassQuery = () =>
  ClassModel.find()
    .populate('sections', 'name capacity currentStudents isActive')
    .populate('classTeacherId', 'name email phone role');

const getClassesWithTotals = async (institutionId: any) => {
  const [classes, totals] = await Promise.all([
    populateClassQuery().where({ institutionId }).sort({ createdAt: -1 }).lean(),
    Student.aggregate([
      { $match: { institutionId } },
      { $group: { _id: '$classId', totalStudents: { $sum: 1 } } },
    ]),
  ]);
  const totalByClass = new Map(totals.map((item: any) => [String(item._id), item.totalStudents]));
  return classes.map((classItem: any) => ({
    ...classItem,
    totalStudents: totalByClass.get(String(classItem._id)) || 0,
    status: classItem.isActive ? 'active' : 'inactive',
  }));
};

const syncSections = async (classId: any, institutionId: any, sections: any[]) => {
  const incomingSections = normalizeSections(sections.length ? sections : defaultSections());
  const nextIds = [];

  for (const section of incomingSections) {
    if (section._id) {
      const updated = await Section.findOneAndUpdate(
        { _id: section._id, classId, institutionId },
        {
          name: section.name,
          capacity: section.capacity,
          currentStudents: section.currentStudents,
          isActive: section.isActive,
        },
        { new: true }
      );
      if (updated) nextIds.push(updated._id);
      continue;
    }

    const created = await Section.create({
      name: section.name,
      classId,
      capacity: section.capacity,
      currentStudents: section.currentStudents,
      isActive: section.isActive,
      institutionId,
    });
    nextIds.push(created._id);
  }

  if (incomingSections.length) {
    await Section.updateMany({ classId, institutionId, _id: { $nin: nextIds } }, { isActive: false });
  }
  return nextIds;
};

const runClassStorage = async (callback: () => Promise<any>) => {
  const context = getTenantStorageContext();
  if (context?.mongoUri) return callback();
  return runWithTenantStorage(null, callback);
};

router.get('/', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const classes = await runClassStorage(() => getClassesWithTotals(req.user.institutionId));
    res.json({ classes });
  } catch (error: any) {
    res.status(500).json({ message: readableError(error), error: { name: error?.name, message: error?.message } });
  }
});

router.post('/', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const result = await runClassStorage(async () => {
      const bulkItems = normalizeBulkItems(req.body);
      const payloadItems = bulkItems && bulkItems.length > 0 ? bulkItems : [req.body];
      const createdItems: any[] = [];

      for (const item of payloadItems) {
        const payload = normalizeClassPayload(item, req.body);
        if (!payload.name) {
          const badRequest: any = new Error('Class name is required.');
          badRequest.statusCode = 400;
          throw badRequest;
        }

        const classItem = await ClassModel.create({
          name: payload.name,
          grade: payload.grade,
          shift: payload.shift,
          classTeacherId: payload.classTeacherId,
          academicYear: payload.academicYear,
          isActive: payload.isActive,
          institutionId: req.user.institutionId,
        });

        classItem.sections = await syncSections(classItem._id, req.user.institutionId, payload.sections);
        await classItem.save();

        const created = await populateClassQuery().where({ _id: classItem._id, institutionId: req.user.institutionId }).findOne();
        createdItems.push(created);
      }

      return bulkItems && bulkItems.length > 0 ? { classItems: createdItems } : { classItem: createdItems[0] };
    });

    res.status(201).json(result);
  } catch (error: any) {
    const statusCode = error?.statusCode || (error?.name === 'ValidationError' ? 400 : 500);
    res.status(statusCode).json({ message: readableError(error), error: { name: error?.name, message: error?.message, code: error?.code } });
  }
});

router.get('/:id', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const classItem = await runClassStorage(() => populateClassQuery().where({ _id: req.params.id, institutionId: req.user.institutionId }).findOne());
    if (!classItem) return res.status(404).json({ message: 'Class not found' });
    res.json({ classItem });
  } catch (error: any) {
    res.status(500).json({ message: readableError(error), error: { name: error?.name, message: error?.message } });
  }
});

router.put('/:id', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const updated = await runClassStorage(async () => {
      const classItem = await ClassModel.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
      if (!classItem) return null;
      const payload = normalizeClassPayload(req.body, {});
      classItem.name = payload.name;
      classItem.grade = payload.grade;
      classItem.shift = payload.shift as any;
      classItem.classTeacherId = payload.classTeacherId;
      classItem.academicYear = payload.academicYear;
      classItem.isActive = payload.isActive;
      classItem.sections = await syncSections(classItem._id, req.user.institutionId, payload.sections);
      await classItem.save();
      return populateClassQuery().where({ _id: classItem._id, institutionId: req.user.institutionId }).findOne();
    });
    if (!updated) return res.status(404).json({ message: 'Class not found' });
    res.json({ classItem: updated });
  } catch (error: any) {
    const statusCode = error?.name === 'ValidationError' ? 400 : 500;
    res.status(statusCode).json({ message: readableError(error), error: { name: error?.name, message: error?.message, code: error?.code } });
  }
});

router.delete('/:id', authenticate, canManageAcademic(), async (req, res) => {
  try {
    await runClassStorage(async () => {
      const classItem = await ClassModel.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
      if (!classItem) {
        const notFound: any = new Error('Class not found');
        notFound.statusCode = 404;
        throw notFound;
      }
      const studentCount = await Student.countDocuments({ classId: classItem._id, institutionId: req.user.institutionId });
      if (studentCount > 0) {
        const conflict: any = new Error('Cannot delete a class with enrolled students. Mark it inactive instead.');
        conflict.statusCode = 409;
        throw conflict;
      }
      await Section.deleteMany({ classId: classItem._id, institutionId: req.user.institutionId });
      await classItem.deleteOne();
    });
    res.json({ message: 'Class deleted' });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: readableError(error), error: { name: error?.name, message: error?.message } });
  }
});

export default router;
