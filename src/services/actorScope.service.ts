import Student from '../models/Student';
import Parent from '../models/Parent';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import { getTenantStorageContext, runWithTenantStorage } from '../config/tenantStorage';
import { normalizeRole } from '../middleware/auth';

export type ActorScope = {
  userId: string;
  role: string;
  institutionId: any;
  tenantId?: string;
  isSystemAdmin: boolean;
  isSchoolLeader: boolean;
  studentId?: any;
  childStudentIds: any[];
  teacherId?: any;
  staffId?: any;
  assignedClassIds: string[];
  assignedSectionIds: string[];
  assignedSubjectIds: string[];
  permissions: string[];
};

const systemAdminRoles = ['admin', 'super_admin'];
const schoolLeaderRoles = ['head', 'assistant_head'];
const teacherRoles = ['teacher', 'subject_teacher', 'class_teacher'];
const staffRoles = ['staff', 'finance_officer', 'librarian'];

export const toId = (value: any) => String(value?._id || value?.id || value || '');
export const uniqueIds = (items: any[] = []) => [...new Set(items.map(toId).filter(Boolean))];

const getReqUser = (reqOrUser: any) => reqOrUser?.user || reqOrUser;
const getTenantId = (reqOrUser: any, institutionId: any) => {
  const ctx = getTenantStorageContext();
  return String(reqOrUser?.tenantId || reqOrUser?.headers?.['x-tenant-id'] || ctx?.institutionId || institutionId || '');
};

const findOneWithPrimaryFallback = async (model: any, query: any, projection = '') => {
  const fromTenant = await model.findOne(query).select(projection).lean().catch(() => null);
  if (fromTenant) return fromTenant;
  return runWithTenantStorage(null, () => model.findOne(query).select(projection).lean().catch(() => null));
};

const findManyWithPrimaryFallback = async (model: any, query: any, projection = '') => {
  const fromTenant = await model.find(query).select(projection).lean().catch(() => []);
  if (Array.isArray(fromTenant) && fromTenant.length) return fromTenant;
  return runWithTenantStorage(null, () => model.find(query).select(projection).lean().catch(() => []));
};

export async function resolveActorScope(reqOrUser: any): Promise<ActorScope> {
  const user = getReqUser(reqOrUser) || {};
  const institutionId = user.institutionId?._id || user.institutionId;
  const userId = user._id || user.id;
  const role = normalizeRole(user.role);
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  const scope: ActorScope = {
    userId: toId(userId),
    role,
    institutionId,
    tenantId: getTenantId(reqOrUser, institutionId),
    isSystemAdmin: systemAdminRoles.includes(role),
    isSchoolLeader: schoolLeaderRoles.includes(role) || systemAdminRoles.includes(role),
    childStudentIds: [],
    assignedClassIds: uniqueIds(user.assignedClasses || user.classIds || []),
    assignedSectionIds: uniqueIds(user.assignedSections || user.sectionIds || []),
    assignedSubjectIds: uniqueIds(user.subjects || user.assignedSubjects || user.subjectIds || []),
    permissions,
  };

  if (!scope.userId || !institutionId) return scope;

  if (role === 'student') {
    const student = await findOneWithPrimaryFallback(Student, { institutionId, userId: scope.userId, isActive: { $ne: false } }, '_id classId sectionId subjects rollNumber admissionNumber idCardNumber');
    if (student) {
      scope.studentId = student._id;
      scope.assignedClassIds = uniqueIds([...scope.assignedClassIds, student.classId]);
      scope.assignedSectionIds = uniqueIds([...scope.assignedSectionIds, student.sectionId]);
      scope.assignedSubjectIds = uniqueIds([...scope.assignedSubjectIds, ...(student.subjects || [])]);
    }
  }

  if (role === 'parent') {
    const parent = await findOneWithPrimaryFallback(Parent, { institutionId, userId: scope.userId }, 'children');
    const children = await findManyWithPrimaryFallback(Student, { institutionId, _id: { $in: parent?.children || [] }, isActive: { $ne: false } }, '_id classId sectionId subjects');
    scope.childStudentIds = uniqueIds(children.map((child: any) => child._id));
    scope.assignedClassIds = uniqueIds([...scope.assignedClassIds, ...children.map((child: any) => child.classId)]);
    scope.assignedSectionIds = uniqueIds([...scope.assignedSectionIds, ...children.map((child: any) => child.sectionId)]);
    scope.assignedSubjectIds = uniqueIds([...scope.assignedSubjectIds, ...children.flatMap((child: any) => child.subjects || [])]);
  }

  if (teacherRoles.includes(role)) {
    const teacher = await findOneWithPrimaryFallback(Teacher, { institutionId, userId: scope.userId, isActive: { $ne: false } }, '_id assignedClasses subjects sectionIds assignedSections');
    if (teacher) {
      scope.teacherId = teacher._id;
      scope.assignedClassIds = uniqueIds([...scope.assignedClassIds, ...(teacher.assignedClasses || [])]);
      scope.assignedSectionIds = uniqueIds([...scope.assignedSectionIds, ...(teacher.assignedSections || []), ...(teacher.sectionIds || [])]);
      scope.assignedSubjectIds = uniqueIds([...scope.assignedSubjectIds, ...(teacher.subjects || [])]);
    }
  }

  if (staffRoles.includes(role)) {
    const staff = await findOneWithPrimaryFallback(Staff, { institutionId, userId: scope.userId, isActive: { $ne: false } }, '_id');
    if (staff) scope.staffId = staff._id;
  }

  return scope;
}

export function missingScope(scope: ActorScope, type: 'class' | 'section' | 'subject' | 'student' | 'employee') {
  if (type === 'class') return !scope.assignedClassIds.length;
  if (type === 'section') return !scope.assignedSectionIds.length;
  if (type === 'subject') return !scope.assignedSubjectIds.length;
  if (type === 'student') return !scope.studentId && !scope.childStudentIds.length;
  if (type === 'employee') return !scope.teacherId && !scope.staffId;
  return true;
}
