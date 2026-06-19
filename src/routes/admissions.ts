import express from 'express';
import Institution from '../models/Institution';
import AdmissionApplication from '../models/AdmissionApplication';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Student from '../models/Student';
import User from '../models/User';
import Parent from '../models/Parent';
import SiteSetting from '../models/SiteSetting';
import { authenticate } from '../middleware/auth';
import { getTenantStorageContext, runWithTenantStorage } from '../config/tenantStorage';
import { generatePassword, generateUsername, hashPassword } from '../utils/credentials';
import { buildCredentialSmsMessage, sendSMS } from '../utils/sms';

const router = express.Router();

const canAcceptAdmission = (role: string) => ['head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher'].includes(role);
const primaryDb = async <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);

const getActiveMongo = (value: any = {}) => {
  const items = Array.isArray(value.mongodbUris) ? value.mongodbUris : [];
  const active = items.find((item: any) => item?.isActive) || items[items.length - 1];
  return String(active?.uri || active?.mongodbUrl || value.mongodbUri || value.mongodbUrl || '').trim();
};

const resolveSchoolMongoUri = async (req: any) => {
  const institutionId = req.user?.institutionId;
  const authSettings = req.user?.institution?.settings || {};
  const authUri = getActiveMongo(authSettings);
  if (authUri) return authUri;

  if (institutionId) {
    const institution: any = await primaryDb(() => Institution.findById(institutionId).select('settings billing').lean());
    const settingsUri = getActiveMongo(institution?.settings || {});
    if (settingsUri) return settingsUri;
  }

  const siteConfig: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
  return getActiveMongo(siteConfig);
};

const schoolDb = async <T>(req: any, fn: () => Promise<T>) => {
  let context = getTenantStorageContext();
  if (!context?.mongoUri) {
    const mongoUri = await resolveSchoolMongoUri(req);
    if (!mongoUri) {
      const error: any = new Error('School MongoDB URI missing. Save active MongoDB URI in Settings before approving public admissions.');
      error.statusCode = 428;
      throw error;
    }
    context = { institutionId: String(req.user.institutionId), mongoUri };
  }
  return runWithTenantStorage(context, fn, req.user, req.user?.institution);
};

const ensureClassAndSection = async (institutionId: any, className: string, sectionName = 'A') => {
  const safeClassName = String(className || 'Class 1').trim();
  const safeSectionName = String(sectionName || 'A').trim() || 'A';
  const classItem = await ClassModel.findOneAndUpdate(
    { institutionId, name: safeClassName },
    { $setOnInsert: { institutionId, name: safeClassName, grade: safeClassName.match(/\d+/)?.[0] || safeClassName, academicYear: String(new Date().getFullYear()), shift: 'day' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const section = await Section.findOneAndUpdate(
    { institutionId, classId: classItem._id, name: safeSectionName },
    { $setOnInsert: { institutionId, classId: classItem._id, name: safeSectionName, capacity: 30, currentStudents: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await ClassModel.updateOne({ _id: classItem._id, institutionId }, { $addToSet: { sections: section._id } });
  return { classId: classItem._id, sectionId: section._id };
};

const admissionError = (error: any) => {
  if (error?.code === 'TENANT_STORAGE_UNAVAILABLE') return 'School personal data storage is unavailable. Please open Settings and check the active MongoDB URI, then try approval again.';
  if (error?.name === 'ValidationError') return Object.values(error.errors || {}).map((item: any) => item?.message).filter(Boolean).join(', ') || error.message;
  if (error?.code === 11000) return 'Duplicate user/student information found. Please change username/email/roll number.';
  return error?.message || 'Failed to process admission.';
};

const getRequestedSubdomain = (req: any) => {
  const value = String(req.query.subdomain || req.headers['x-client-subdomain'] || '').trim().toLowerCase();
  return value && !['www', 'app', 'api', 'admin'].includes(value) ? value : '';
};

router.get('/public/schools', async (req, res) => {
  const search = String(req.query.search || '').trim();
  let tenantInstitution = (req as any).institution;
  const requestedSubdomain = getRequestedSubdomain(req);

  const querySubdomain = String(req.query.subdomain || req.headers['x-client-subdomain'] || '').trim().toLowerCase();
  const queryDomain = String(req.query.domain || req.headers['x-client-domain'] || '').trim().toLowerCase();
  const mainDomain = (process.env.MAIN_DOMAIN || 'easyschool.live').toLowerCase();
  const isMainDomainOrLocal = ['localhost', '127.0.0.1', mainDomain].includes(queryDomain);
  const isSpecificSearch = Boolean((querySubdomain && !['www', 'app', 'api', 'admin'].includes(querySubdomain)) || (queryDomain && !isMainDomainOrLocal));

  if (!tenantInstitution && isSpecificSearch) {
    if (querySubdomain && !['www', 'app', 'api', 'admin'].includes(querySubdomain)) {
      tenantInstitution = await Institution.findOne({ subdomain: querySubdomain, isActive: true }).lean();
      if (!tenantInstitution) return res.json({ schools: [] });
    } else if (queryDomain) {
      tenantInstitution = await Institution.findOne({
        isActive: true,
        $or: [
          { website: new RegExp(queryDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
          { domains: queryDomain },
          { domains: `www.${queryDomain}` },
        ],
      }).lean();
    }
  }

  if (tenantInstitution) {
    const school = await Institution.findOne({ _id: tenantInstitution._id, isActive: true }).select('name type eiin address phone email website subdomain');
    return res.json({ schools: school ? [school] : [] });
  }

  if (isSpecificSearch) return res.json({ schools: [] });

  const query: any = { isActive: true };
  if (search) query.$or = [{ name: new RegExp(search, 'i') }, { address: new RegExp(search, 'i') }, { eiin: new RegExp(search, 'i') }];
  const schools = await Institution.find(query).select('name type eiin address phone email website subdomain').sort({ name: 1 }).limit(100);
  res.json({ schools });
});

router.post('/public/apply', async (req, res) => {
  const requestedSubdomain = getRequestedSubdomain(req);
  if (requestedSubdomain) {
    const school = await Institution.findOne({ subdomain: requestedSubdomain, isActive: true }).lean();
    if (!school) return res.status(404).json({ message: 'School not found' });
    if (String(req.body.institutionId || '') !== String(school._id)) return res.status(403).json({ message: 'This subdomain can only submit applications for its own school.' });
  }

  const application = await primaryDb(() => AdmissionApplication.create({
    institutionId: req.body.institutionId,
    studentName: req.body.studentName || req.body.name,
    guardianName: req.body.guardianName,
    guardianPhone: req.body.guardianPhone,
    guardianEmail: req.body.guardianEmail,
    dateOfBirth: req.body.dateOfBirth || undefined,
    address: req.body.address,
    previousSchool: req.body.previousSchool,
    previousResult: req.body.previousResult,
    requestedClass: req.body.requestedClass || req.body.className,
  }));
  res.status(201).json({ application, message: 'Admission application submitted' });
});

router.get('/', authenticate, async (req: any, res) => {
  const applications = await primaryDb(() => AdmissionApplication.find({ institutionId: req.user.institutionId }).populate('institutionId', 'name').sort({ createdAt: -1 }));
  res.json({ applications });
});

router.post('/:id/accept', authenticate, async (req: any, res) => {
  try {
    if (!canAcceptAdmission(req.user.role)) return res.status(403).json({ message: 'Teacher or school leadership can accept admission' });
    const application = await primaryDb(() => AdmissionApplication.findOne({ _id: req.params.id, institutionId: req.user.institutionId }));
    if (!application) return res.status(404).json({ message: 'Application not found' });
    if (application.status !== 'pending') return res.status(400).json({ message: 'Application is already processed' });

    const classInfo = await schoolDb(req, async () => ensureClassAndSection(req.user.institutionId, req.body.className || application.requestedClass, req.body.sectionName || 'A'));

    const username = await primaryDb(() => generateUsername(application.studentName, 'student'));
    const password = generatePassword();
    const parentUsername = await primaryDb(() => generateUsername(application.guardianName, 'parent'));
    const parentPassword = generatePassword();
    const email = req.body.email || application.guardianEmail || `${username}@student.local`;

    const { user, parentUser } = await primaryDb(async () => {
      const studentUser = await User.create({ name: application.studentName, username, email, password: await hashPassword(password), role: 'student', phone: application.guardianPhone, gender: req.body.studentGender || req.body.gender, institutionId: req.user.institutionId });
      const guardianUser = await User.create({ name: application.guardianName, username: parentUsername, email: application.guardianEmail || `${parentUsername}@parent.local`, password: await hashPassword(parentPassword), role: 'parent', phone: application.guardianPhone, gender: req.body.guardianGender || req.body.parentGender, institutionId: req.user.institutionId });
      return { user: studentUser, parentUser: guardianUser };
    });

    const { student } = await schoolDb(req, async () => {
      const createdStudent = await Student.create({
        userId: user._id,
        rollNumber: req.body.rollNumber || `ADM-${Date.now()}`,
        classId: classInfo.classId,
        sectionId: classInfo.sectionId,
        admissionDate: new Date(),
        dateOfBirth: application.dateOfBirth || new Date('2000-01-01'),
        address: application.address,
        parentId: parentUser._id,
        guardianName: application.guardianName,
        guardianPhone: application.guardianPhone,
        guardianEmail: application.guardianEmail,
        subjects: [],
        institutionId: req.user.institutionId,
      });
      await Parent.create({ userId: parentUser._id, children: [createdStudent._id], address: application.address, emergencyContact: application.guardianName, emergencyPhone: application.guardianPhone, institutionId: req.user.institutionId });
      await Section.findByIdAndUpdate(classInfo.sectionId, { $inc: { currentStudents: 1 } });
      return { student: createdStudent };
    });

    await primaryDb(async () => {
      application.status = 'accepted';
      application.acceptedBy = req.user._id;
      application.acceptedAt = new Date();
      application.studentId = student._id as any;
      await application.save();
    });

    await sendSMS({ to: application.guardianPhone, message: buildCredentialSmsMessage({ summary: 'Admission accepted', username, password, parentUsername, parentPassword }), institutionId: req.user.institutionId });
    res.json({ application, student, credentials: { username, password, parentUsername, parentPassword } });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: admissionError(error), error: { name: error?.name, message: error?.message, code: error?.code } });
  }
});

router.post('/:id/reject', authenticate, async (req: any, res) => {
  if (!canAcceptAdmission(req.user.role)) return res.status(403).json({ message: 'Teacher or school leadership can reject admission' });
  const application = await primaryDb(() => AdmissionApplication.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, { status: 'rejected' }, { new: true }));
  if (!application) return res.status(404).json({ message: 'Application not found' });
  res.json({ application });
});

export default router;
