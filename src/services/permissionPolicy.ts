import { Response, NextFunction } from 'express';
import Student from '../models/Student';
import Parent from '../models/Parent';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';

type Action =
  | 'result:create' | 'result:update' | 'result:delete' | 'result:approve_assistant' | 'result:approve_head' | 'result:publish'
  | 'exam:create' | 'exam:update' | 'exam:delete' | 'exam:approve' | 'exam:publish'
  | 'class:create' | 'class:update' | 'class:delete'
  | 'subject:create' | 'subject:update' | 'subject:delete'
  | 'syllabus:create' | 'syllabus:update' | 'syllabus:delete'
  | 'routine:create' | 'routine:update' | 'routine:delete' | 'routine:publish'
  | 'attendance:mark' | 'leave:create' | 'leave:approve'
  | 'library:manage' | 'idcard:generate' | 'idcard:manage' | 'idcard:scan'
  | 'settings:update' | 'sms:monitor';

const systemAdminRoles = ['admin', 'super_admin'];
const schoolLeaderRoles = ['head', 'assistant_head'];
const schoolLeaderAdminRoles = ['assistant_head', 'head', 'admin', 'super_admin'];
const headPublishRoles = ['head', 'admin', 'super_admin'];
const resultApproverRoles = ['assistant_head', 'head', 'admin', 'super_admin'];
const resultEntryRoles = ['teacher', 'subject_teacher'];
const teacherRoles = ['teacher', 'subject_teacher', 'class_teacher'];
const blockedResultRoles = ['student', 'parent', 'staff', 'finance_officer', 'librarian', 'committee_member'];
const blockedAcademicDataRoles = ['staff', 'finance_officer', 'librarian', 'committee_member'];

export const toId = (value: any) => String(value?._id || value || '');
export const idList = (items: any[] = []) => [...new Set(items.map(toId).filter(Boolean))];
export const hasPermission = (user: any, permission: string) => Array.isArray(user?.permissions) && (user.permissions.includes(permission) || user.permissions.includes(permission.replace(':', '.')));
export const isSystemAdmin = (user: any) => systemAdminRoles.includes(user?.role);
export const isSchoolLeader = (user: any) => schoolLeaderRoles.includes(user?.role) || isSystemAdmin(user);
export const isHeadPublisher = (user: any) => headPublishRoles.includes(user?.role);

export async function resolveActorScope(user: any, _tenantConnection?: any) {
  const institutionId = user?.institutionId?._id || user?.institutionId;
  const userId = user?._id || user?.id;
  const scope: any = { role: user?.role, institutionId, userId, studentId: undefined, childStudentIds: [], teacherId: undefined, staffId: undefined, assignedClassIds: idList(user?.assignedClasses || user?.classIds || []), assignedSectionIds: idList(user?.assignedSections || user?.sectionIds || []), assignedSubjectIds: idList(user?.subjects || user?.assignedSubjects || user?.subjectIds || []), isSchoolLeader: isSchoolLeader(user), isSystemAdmin: isSystemAdmin(user) };
  if (!userId || !institutionId) return scope;
  if (user.role === 'student') {
    const student = await Student.findOne({ institutionId, userId, isActive: true }).select('_id classId sectionId').lean().catch(() => null);
    if (student) { scope.studentId = student._id; scope.assignedClassIds = idList([...scope.assignedClassIds, student.classId]); scope.assignedSectionIds = idList([...scope.assignedSectionIds, student.sectionId]); }
  }
  if (user.role === 'parent') {
    const parent = await Parent.findOne({ institutionId, userId }).select('children').lean().catch(() => null);
    const children = await Student.find({ institutionId, _id: { $in: parent?.children || [] }, isActive: true }).select('_id classId sectionId').lean().catch(() => []);
    scope.childStudentIds = idList(children.map((child: any) => child._id));
    scope.assignedClassIds = idList([...scope.assignedClassIds, ...children.map((child: any) => child.classId)]);
    scope.assignedSectionIds = idList([...scope.assignedSectionIds, ...children.map((child: any) => child.sectionId)]);
  }
  if (teacherRoles.includes(user.role)) {
    const teacher = await Teacher.findOne({ institutionId, userId, isActive: { $ne: false } }).select('_id assignedClasses subjects').lean().catch(() => null);
    if (teacher) { scope.teacherId = teacher._id; scope.assignedClassIds = idList([...scope.assignedClassIds, ...(teacher.assignedClasses || [])]); scope.assignedSubjectIds = idList([...scope.assignedSubjectIds, ...(teacher.subjects || [])]); }
  }
  if (['staff', 'finance_officer', 'librarian'].includes(user.role)) {
    const staff = await Staff.findOne({ institutionId, userId, isActive: { $ne: false } }).select('_id').lean().catch(() => null);
    if (staff) scope.staffId = staff._id;
  }
  return scope;
}

export function canPerform(action: Action, user: any) {
  if (!user) return false;
  if (isSystemAdmin(user)) return true;
  if (hasPermission(user, action)) return true;
  switch (action) {
    case 'result:create':
    case 'result:update': return resultEntryRoles.includes(user.role);
    case 'result:delete': return user.role === 'head';
    case 'result:approve_assistant': return ['assistant_head', 'head'].includes(user.role);
    case 'result:approve_head':
    case 'result:publish': return user.role === 'head';
    case 'exam:create':
    case 'exam:update':
    case 'exam:delete': return ['head', 'assistant_head'].includes(user.role);
    case 'exam:approve': return ['assistant_head', 'head'].includes(user.role);
    case 'exam:publish':
    case 'routine:publish': return ['head', 'assistant_head'].includes(user.role);
    case 'class:create':
    case 'class:update':
    case 'class:delete':
    case 'subject:create':
    case 'subject:update':
    case 'subject:delete':
    case 'syllabus:create':
    case 'syllabus:update':
    case 'syllabus:delete':
    case 'routine:create':
    case 'routine:update':
    case 'routine:delete':
    case 'settings:update':
    case 'sms:monitor': return ['head', 'assistant_head'].includes(user.role);
    case 'attendance:mark': return ['head', 'assistant_head', 'class_teacher'].includes(user.role);
    case 'leave:create': return ['student', 'parent', 'teacher', 'class_teacher', 'subject_teacher', 'staff', 'finance_officer', 'librarian'].includes(user.role);
    case 'leave:approve': return ['head', 'assistant_head', 'class_teacher'].includes(user.role);
    case 'library:manage': return ['head', 'assistant_head', 'librarian'].includes(user.role);
    case 'idcard:generate':
    case 'idcard:manage': return ['head', 'assistant_head'].includes(user.role);
    case 'idcard:scan': return ['head', 'assistant_head', 'class_teacher'].includes(user.role);
    default: return false;
  }
}

export const requireAction = (action: Action) => (req: any, res: Response, next: NextFunction) => { if (!req.user) return res.status(401).json({ message: 'Authentication required.' }); if (!canPerform(action, req.user)) return res.status(403).json({ message: 'Access denied.' }); return next(); };
export const resultEntryGuard = async (req: any, res: Response, next: NextFunction) => { if (!req.user) return res.status(401).json({ message: 'Authentication required.' }); if (blockedResultRoles.includes(req.user.role)) return res.status(403).json({ message: 'Access denied. This role cannot enter results.' }); if (isHeadPublisher(req.user) || hasPermission(req.user, 'result:create') || hasPermission(req.user, 'result:update') || resultEntryRoles.includes(req.user.role)) return next(); return res.status(403).json({ message: 'Access denied. Result entry permission is required.' }); };
export const resultApproveGuard = (req: any, res: Response, next: NextFunction) => { if (!req.user) return res.status(401).json({ message: 'Authentication required.' }); if (resultApproverRoles.includes(req.user.role) || hasPermission(req.user, 'result:approve_assistant') || hasPermission(req.user, 'result:approve_head')) return next(); return res.status(403).json({ message: 'Access denied. Result approval permission is required.' }); };
export const resultPublishGuard = (req: any, res: Response, next: NextFunction) => { if (!req.user) return res.status(401).json({ message: 'Authentication required.' }); if (headPublishRoles.includes(req.user.role) || hasPermission(req.user, 'result:publish')) return next(); return res.status(403).json({ message: 'Access denied. Only Head/Admin can publish results.' }); };
export const resultDeleteGuard = (req: any, res: Response, next: NextFunction) => { if (!req.user) return res.status(401).json({ message: 'Authentication required.' }); if (headPublishRoles.includes(req.user.role) || hasPermission(req.user, 'result:delete')) return next(); return res.status(403).json({ message: 'Access denied. Only Head/Admin can delete results.' }); };

export const examManageGuard = (req: any, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  if (schoolLeaderAdminRoles.includes(req.user.role) || hasPermission(req.user, 'exam:create') || hasPermission(req.user, 'exam:update') || hasPermission(req.user, 'exam:delete')) return next();
  return res.status(403).json({ message: 'Access denied. Exam management is restricted to school leaders/admins.' });
};

export const examPublishGuard = (req: any, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  if (schoolLeaderAdminRoles.includes(req.user.role) || hasPermission(req.user, 'exam:publish') || hasPermission(req.user, 'routine:publish')) return next();
  return res.status(403).json({ message: 'Access denied. Exam routine publishing is restricted to school leaders/admins.' });
};

export const examApproveGuard = (req: any, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  if (schoolLeaderAdminRoles.includes(req.user.role) || hasPermission(req.user, 'exam:approve')) return next();
  return res.status(403).json({ message: 'Access denied. Exam approval is restricted to school leaders/admins.' });
};

export async function teacherAssignedExamScope(user: any, base: any = {}) {
  const scope = await resolveActorScope(user);
  if (!['teacher', 'subject_teacher'].includes(user?.role)) return null;
  if (!scope.assignedClassIds.length && !scope.assignedSubjectIds.length) return null;
  const or: any[] = [];
  if (scope.assignedClassIds.length) or.push({ classId: { $in: scope.assignedClassIds } });
  if (scope.assignedSubjectIds.length) or.push({ subjectId: { $in: scope.assignedSubjectIds } }, { 'subjectMarks.subjectId': { $in: scope.assignedSubjectIds } });
  return { ...base, $or: or };
}

export async function classTeacherExamScope(user: any, base: any = {}) {
  const scope = await resolveActorScope(user);
  if (user?.role !== 'class_teacher') return null;
  if (!scope.assignedClassIds.length) return null;
  return { ...base, classId: { $in: scope.assignedClassIds } };
}

export async function publishedOwnClassExamScope(user: any, base: any = {}) {
  const scope = await resolveActorScope(user);
  if (user?.role !== 'student' || !scope.assignedClassIds.length) return null;
  return { ...base, classId: { $in: scope.assignedClassIds }, isPublished: true };
}

export async function childClassExamScope(user: any, base: any = {}) {
  const scope = await resolveActorScope(user);
  if (user?.role !== 'parent' || !scope.assignedClassIds.length) return null;
  return { ...base, classId: { $in: scope.assignedClassIds }, isPublished: true };
}

export async function examReadScope(user: any, base: any = {}) {
  if (!user) return null;
  if (blockedAcademicDataRoles.includes(user.role)) return null;
  if (isSchoolLeader(user) || isSystemAdmin(user)) return base;
  if (['teacher', 'subject_teacher'].includes(user.role)) return teacherAssignedExamScope(user, base);
  if (user.role === 'class_teacher') return classTeacherExamScope(user, base);
  if (user.role === 'student') return publishedOwnClassExamScope(user, base);
  if (user.role === 'parent') return childClassExamScope(user, base);
  return null;
}

export async function assignedSubjectResultScope(user: any, classId?: any, subjectId?: any) { if (isHeadPublisher(user) || isSchoolLeader(user)) return { allowed: true, scope: await resolveActorScope(user) }; const scope = await resolveActorScope(user); if (!teacherRoles.includes(user.role)) return { allowed: false, scope }; const classOk = classId ? scope.assignedClassIds.includes(toId(classId)) : scope.assignedClassIds.length > 0; const subjectOk = subjectId ? scope.assignedSubjectIds.includes(toId(subjectId)) : scope.assignedSubjectIds.length > 0; return { allowed: Boolean(classOk && subjectOk), scope }; }
export async function ownResultScope(user: any) { const scope = await resolveActorScope(user); if (user?.role !== 'student' || !scope.studentId) return null; return { institutionId: scope.institutionId, studentId: scope.studentId }; }
export async function childResultScope(user: any, studentId?: any) { const scope = await resolveActorScope(user); if (user?.role !== 'parent' || !scope.childStudentIds.length) return null; const allowedChildIds = scope.childStudentIds.map(String); if (studentId && !allowedChildIds.includes(String(studentId))) return null; return { institutionId: scope.institutionId, studentId: studentId || { $in: scope.childStudentIds } }; }
export async function canUseClassAndSubject(user: any, classId?: any, subjectId?: any) { const result = await assignedSubjectResultScope(user, classId, subjectId); return result.allowed; }

export function scopedClassQuery(scope: any, base: any = {}) { if (scope.isSchoolLeader || scope.isSystemAdmin) return base; if (blockedAcademicDataRoles.includes(scope.role)) return null; if (['student', 'parent', 'teacher', 'subject_teacher', 'class_teacher'].includes(scope.role) && scope.assignedClassIds.length) return { ...base, _id: { $in: scope.assignedClassIds } }; return null; }
export function scopedSubjectQuery(scope: any, base: any = {}) { if (scope.isSchoolLeader || scope.isSystemAdmin) return base; if (blockedAcademicDataRoles.includes(scope.role)) return null; if (['student', 'parent', 'class_teacher'].includes(scope.role)) { if (!scope.assignedClassIds.length) return null; return { ...base, classId: { $in: scope.assignedClassIds } }; } if (['teacher', 'subject_teacher'].includes(scope.role)) { if (!scope.assignedSubjectIds.length) return null; return { ...base, _id: { $in: scope.assignedSubjectIds } }; } return null; }
export function scopedExamQuery(scope: any, base: any = {}) { if (scope.isSchoolLeader || scope.isSystemAdmin) return base; const query = { ...base }; if (['student', 'parent'].includes(scope.role)) { if (!scope.assignedClassIds.length) return null; query.classId = { $in: scope.assignedClassIds }; query.isPublished = true; return query; } if (scope.assignedClassIds.length) query.classId = { $in: scope.assignedClassIds }; if (!query.classId) return null; return query; }
