import { Request } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import Institution from '../models/Institution';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import Parent from '../models/Parent';
import Committee from '../models/Committee';

export type NormalizedRole = string;

const teacherRoles = ['teacher', 'subject_teacher', 'class_teacher', 'head', 'assistant_head'];
const staffRoles = ['staff', 'finance_officer', 'librarian'];
const adminRoles = ['admin', 'super_admin', 'superadmin', 'platform_admin'];
const idOf = (value: any) => String(value?._id || value?.id || value || '');
const compact = (values: any[]) => Array.from(new Set(values.map(idOf).filter(Boolean)));
const clean = (value: any) => String(value || '').trim();
const isObjectId = (value: any) => mongoose.Types.ObjectId.isValid(String(value || ''));
const regexSafe = (value: any) => clean(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rx = (value: any) => new RegExp(regexSafe(value), 'i');

export function normalizeRole(role: any): NormalizedRole {
  const value = clean(role).toLowerCase().replace(/[\s-]+/g, '_');
  if (value === 'guardian') return 'parent';
  if (value === 'principal') return 'head';
  if (value === 'assistanthead') return 'assistant_head';
  return value || 'user';
}

function generatedUsernamePrefix(username: any, name?: any) {
  const u = clean(username);
  const n = clean(name);
  if (!u) return '';
  if (n && u.toLowerCase().startsWith(n.toLowerCase())) return n;
  const match = u.match(/^([a-zA-Z\u0980-\u09FF\s._-]+?)(?=\d|[a-z0-9]{8,}$)/i);
  return clean((match?.[1] || '').replace(/[._-]+$/g, ''));
}

async function userCandidates(user: any) {
  const institutionId = user.institutionId;
  const or: any[] = [];
  if (user.username) or.push({ username: user.username }, { username: rx(user.username) });
  if (user.email) or.push({ email: String(user.email).toLowerCase() });
  if (user.phone) or.push({ phone: user.phone });
  if (user.name) or.push({ name: user.name }, { name: rx(user.name) });
  const prefix = generatedUsernamePrefix(user.username, user.name);
  if (prefix) or.push({ name: rx(prefix) }, { username: rx(prefix) });
  if (!or.length) return [];
  return User.find({ institutionId, $or: or }).select('_id name username email phone avatar role institutionId isActive').limit(8).lean().maxTimeMS(5000).catch(() => []);
}

const populateStudentQuery = (query: any) => Student.findOne(query)
  .populate('userId', 'name username email phone avatar role')
  .populate('classId', 'name grade')
  .populate('sectionId', 'name')
  .populate('parentId', 'name username email phone avatar role')
  .lean().maxTimeMS(5000).catch(() => null);
const populateStudentList = (query: any) => Student.find(query)
  .populate('userId', 'name username email phone avatar role')
  .populate('classId', 'name grade')
  .populate('sectionId', 'name')
  .populate('parentId', 'name username email phone avatar role')
  .limit(10).lean().maxTimeMS(5000).catch(() => []);
const populateTeacherQuery = (query: any) => Teacher.findOne(query)
  .populate('userId', 'name username email phone avatar role')
  .populate('assignedClasses', 'name grade')
  .populate('subjects', 'name code')
  .populate('institutionId', 'name type email phone address logo logoUrl website headName headSignature')
  .lean().maxTimeMS(5000).catch(() => null);
const populateTeacherList = (query: any) => Teacher.find(query)
  .populate('userId', 'name username email phone avatar role')
  .populate('assignedClasses', 'name grade')
  .populate('subjects', 'name code')
  .limit(10).lean().maxTimeMS(5000).catch(() => []);
const populateStaffQuery = (query: any) => Staff.findOne(query)
  .populate('userId', 'name username email phone avatar role')
  .populate('institutionId', 'name type email phone address logo logoUrl website headName headSignature')
  .lean().maxTimeMS(5000).catch(() => null);
const populateStaffList = (query: any) => Staff.find(query)
  .populate('userId', 'name username email phone avatar role')
  .limit(10).lean().maxTimeMS(5000).catch(() => []);
const populateParentQuery = (query: any) => Parent.findOne(query)
  .populate('userId', 'name username email phone avatar role')
  .populate({ path: 'children', populate: [{ path: 'userId', select: 'name username email phone avatar role' }, { path: 'classId', select: 'name grade' }, { path: 'sectionId', select: 'name' }] })
  .lean().maxTimeMS(5000).catch(() => null);
const populateParentList = (query: any) => Parent.find(query)
  .populate('userId', 'name username email phone avatar role')
  .populate({ path: 'children', populate: [{ path: 'userId', select: 'name username email phone avatar role' }, { path: 'classId', select: 'name grade' }, { path: 'sectionId', select: 'name' }] })
  .limit(10).lean().maxTimeMS(5000).catch(() => []);

export async function repairProfileUserLink(profileType: string, profileId: any, userId: any, institutionId: any) {
  const filter = { _id: profileId, institutionId, $or: [{ userId: { $exists: false } }, { userId: null }, { userId: userId }] } as any;
  const update = { $set: { userId } };
  if (profileType === 'student') return Student.updateOne(filter, update).catch(() => null);
  if (profileType === 'teacher') return Teacher.updateOne(filter, update).catch(() => null);
  if (profileType === 'staff') return Staff.updateOne(filter, update).catch(() => null);
  if (profileType === 'parent') return Parent.updateOne(filter, update).catch(() => null);
  return null;
}

export async function resolveStudentForUser(user: any) {
  const institutionId = user.institutionId;
  const directIds = compact([user._id, user.id]);
  let student: any = await populateStudentQuery({ institutionId, userId: { $in: directIds } });
  if (student) return { profile: student, missing: false };

  const candidateUsers = await userCandidates(user);
  const candidateIds = compact(candidateUsers.map((item: any) => item._id));
  if (candidateIds.length) {
    const matches = await populateStudentList({ institutionId, userId: { $in: candidateIds } });
    if (matches.length === 1) return { profile: matches[0], missing: false, repairedFrom: 'linked_user' };
    if (matches.length > 1) return { profile: null, missing: true, reason: 'ambiguous_match', ambiguousMatches: matches.map((m: any) => m._id) };
  }

  const or: any[] = [];
  if (user.username) or.push({ rollNumber: user.username }, { idCardNumber: user.username }, { admissionNumber: user.username }, { registrationNumber: user.username });
  if (user.phone) or.push({ guardianPhone: user.phone }, { studentPhone: user.phone });
  if (user.email) or.push({ guardianEmail: String(user.email).toLowerCase() });
  if (!or.length) return { profile: null, missing: true, reason: 'not_found' };
  const matches = await populateStudentList({ institutionId, $or: or });
  if (matches.length === 1) {
    await repairProfileUserLink('student', matches[0]._id, user._id, institutionId);
    return { profile: { ...matches[0], userId: matches[0].userId || user }, missing: false, repairedFrom: 'student_fields' };
  }
  return { profile: null, missing: true, reason: matches.length > 1 ? 'ambiguous_match' : 'not_found', ambiguousMatches: matches.map((m: any) => m._id) };
}

export async function resolveTeacherForUser(user: any) {
  const institutionId = user.institutionId;
  const directIds = compact([user._id, user.id]);
  let teacher: any = await populateTeacherQuery({ institutionId, userId: { $in: directIds } });
  if (teacher) return { profile: teacher, missing: false };
  const candidateIds = compact((await userCandidates(user)).map((u: any) => u._id));
  const or: any[] = [];
  if (candidateIds.length) or.push({ userId: { $in: candidateIds } });
  if (user.username) or.push({ employeeId: user.username }, { idCardNumber: user.username });
  if (!or.length) return { profile: null, missing: true, reason: 'not_found' };
  const matches = await populateTeacherList({ institutionId, $or: or });
  if (matches.length === 1) {
    await repairProfileUserLink('teacher', matches[0]._id, user._id, institutionId);
    return { profile: matches[0], missing: false, repairedFrom: 'teacher_fields' };
  }
  return { profile: null, missing: true, reason: matches.length > 1 ? 'ambiguous_match' : 'not_found', ambiguousMatches: matches.map((m: any) => m._id) };
}

export async function resolveStaffForUser(user: any) {
  const institutionId = user.institutionId;
  const directIds = compact([user._id, user.id]);
  let staff: any = await populateStaffQuery({ institutionId, userId: { $in: directIds } });
  if (staff) return { profile: staff, missing: false };
  const candidateIds = compact((await userCandidates(user)).map((u: any) => u._id));
  const or: any[] = [];
  if (candidateIds.length) or.push({ userId: { $in: candidateIds } });
  if (user.username) or.push({ employeeId: user.username }, { idCardNumber: user.username });
  if (!or.length) return { profile: null, missing: true, reason: 'not_found' };
  const matches = await populateStaffList({ institutionId, $or: or });
  if (matches.length === 1) {
    await repairProfileUserLink('staff', matches[0]._id, user._id, institutionId);
    return { profile: matches[0], missing: false, repairedFrom: 'staff_fields' };
  }
  return { profile: null, missing: true, reason: matches.length > 1 ? 'ambiguous_match' : 'not_found', ambiguousMatches: matches.map((m: any) => m._id) };
}

export async function resolveParentForUser(user: any) {
  const institutionId = user.institutionId;
  const directIds = compact([user._id, user.id]);
  let parent: any = await populateParentQuery({ institutionId, userId: { $in: directIds } });
  const childFallback: any[] = [];
  if (user.phone) childFallback.push({ guardianPhone: user.phone });
  if (user.email) childFallback.push({ guardianEmail: String(user.email).toLowerCase() });
  const childrenByContact = childFallback.length ? await populateStudentList({ institutionId, $or: childFallback }) : [];
  if (!parent) {
    const candidateIds = compact((await userCandidates(user)).map((u: any) => u._id));
    const matches = candidateIds.length ? await populateParentList({ institutionId, userId: { $in: candidateIds } }) : [];
    if (matches.length === 1) parent = matches[0];
    else if (matches.length > 1) return { profile: null, children: [], missing: true, reason: 'ambiguous_match', ambiguousMatches: matches.map((m: any) => m._id) };
  }
  if (parent && childrenByContact.length) {
    const existing = compact(parent.children || []);
    const missingIds = childrenByContact.map((c: any) => c._id).filter((id: any) => !existing.includes(idOf(id)));
    if (missingIds.length) await Parent.updateOne({ _id: parent._id, institutionId }, { $addToSet: { children: { $each: missingIds } } }).catch(() => undefined);
    parent.children = [...(parent.children || []), ...childrenByContact.filter((c: any) => !existing.includes(idOf(c._id)))];
  }
  if (parent) return { profile: parent, children: parent.children || [], missing: false };
  if (childrenByContact.length) return { profile: null, children: childrenByContact, missing: false, repairedFrom: 'student_guardian_contact' };
  return { profile: null, children: [], missing: true, reason: 'not_found' };
}

export async function resolveCommitteeForUser(user: any) {
  const institutionId = user.institutionId;
  const ids = compact([user._id, user.id]);
  const committee = await Committee.findOne({ institutionId, isActive: { $ne: false }, $or: [{ chairmanId: { $in: ids } }, { members: { $in: ids } }] }).lean().maxTimeMS(4000).catch(() => null);
  return committee ? { profile: committee, missing: false } : { profile: null, missing: true, reason: 'not_found' };
}

export async function resolveInstitutionContext(req: Request) {
  const institutionId = (req as any).user?.institutionId || (req as any).institutionId || (req as any).institution?._id;
  if ((req as any).institution) return (req as any).institution;
  if (institutionId && isObjectId(institutionId)) return Institution.findById(institutionId).lean().catch(() => null);
  return null;
}

export async function resolveProfileForUser(user: any) {
  const role = normalizeRole(user?.role);
  const result: any = { user, role, roleDetails: null, student: null, teacher: null, staff: null, parent: null, committee: null, children: [], institution: null, profileMissing: false, profileMissingReason: '', ambiguousMatches: [] };
  if (!user) return { ...result, profileMissing: true, profileMissingReason: 'missing_user' };
  result.institution = user.institution || (user.institutionId ? await Institution.findById(user.institutionId).lean().catch(() => null) : null);
  if (adminRoles.includes(role)) return result;
  let resolved: any = null;
  if (role === 'student') { resolved = await resolveStudentForUser(user); result.student = resolved.profile; }
  else if (role === 'parent') { resolved = await resolveParentForUser(user); result.parent = resolved.profile; result.children = resolved.children || []; }
  else if (teacherRoles.includes(role)) { resolved = await resolveTeacherForUser(user); result.teacher = resolved.profile; }
  else if (staffRoles.includes(role)) { resolved = await resolveStaffForUser(user); result.staff = resolved.profile; }
  else if (role === 'committee_member') { resolved = await resolveCommitteeForUser(user); result.committee = resolved.profile; }
  else resolved = { profile: null, missing: true, reason: 'unsupported_role' };
  result.roleDetails = result.student || result.teacher || result.staff || result.parent || result.committee || null;
  result.profileMissing = Boolean(resolved?.missing && !result.roleDetails && !(role === 'parent' && result.children.length));
  result.profileMissingReason = resolved?.reason || '';
  result.ambiguousMatches = resolved?.ambiguousMatches || [];
  return result;
}

export async function syncMissingUserProfileLinks(institutionId: any) {
  const users = await User.find({ institutionId, role: { $nin: adminRoles } }).lean().maxTimeMS(10000).catch(() => []);
  const log = { repairedStudents: 0, repairedTeachers: 0, repairedStaff: 0, repairedParents: 0, repairedCommittees: 0, ambiguousMatches: 0, skippedConflicts: 0, missingUsers: 0 };
  for (const user of users as any[]) {
    const resolved: any = await resolveProfileForUser(user);
    if (resolved.ambiguousMatches?.length) log.ambiguousMatches += 1;
    if (resolved.student) log.repairedStudents += 1;
    else if (resolved.teacher) log.repairedTeachers += 1;
    else if (resolved.staff) log.repairedStaff += 1;
    else if (resolved.parent || resolved.children?.length) log.repairedParents += 1;
    else if (resolved.committee) log.repairedCommittees += 1;
    else log.missingUsers += 1;
  }
  return log;
}
