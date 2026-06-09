import express from 'express';
import { authenticate } from '../middleware/auth';
import Holiday from '../models/Holiday';
import SiteSetting from '../models/SiteSetting';

const router = express.Router();
const manageRoles = ['head', 'assistant_head', 'admin', 'super_admin'];
const canManageHolidays = (role: string) => manageRoles.includes(role);
type HolidaySeed = { title: string; titleBn: string; startDate: string; endDate: string; type: 'government' | 'religious' | 'school' | 'weekend' | 'custom'; color: string; description?: string; };

const dayNameMap: Record<string, number> = { sunday: 0, sun: 0, saturday: 6, sat: 6, friday: 5, fri: 5, thursday: 4, thu: 4, wednesday: 3, wed: 3, tuesday: 2, tue: 2, monday: 1, mon: 1, 'রবিবার': 0, 'শনিবার': 6, 'শুক্রবার': 5, 'বৃহস্পতিবার': 4, 'বুধবার': 3, 'মঙ্গলবার': 2, 'সোমবার': 1 };
const isHex = (value: any) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim());
const normalizeWeeklyDays = (value: any): number[] => {
  if (value === undefined || value === null || value === false || value === '') return [];
  const raw = Array.isArray(value) ? value : typeof value === 'object' ? Object.entries(value).filter(([, enabled]) => enabled === true || enabled === 'true' || enabled === 1 || enabled === '1').map(([day]) => day) : String(value).split(',');
  const days = raw.map((item: any) => typeof item === 'number' ? item : dayNameMap[String(item).trim().toLowerCase()] ?? Number(item)).filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6);
  return Array.from(new Set(days));
};
const findByKeys = (obj: any, keys: string[]): any => {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) if (obj[key] !== undefined) return obj[key];
  for (const value of Object.values(obj)) { const found = findByKeys(value, keys); if (found !== undefined) return found; }
  return undefined;
};
const weeklyDayKeys = ['weeklyDays', 'weeklyOffDays', 'weeklyOff', 'weeklyHoliday', 'weeklyHolidays', 'weekendDays', 'weekend', 'weekends', 'offDays', 'holidayDays', 'closedDays', 'schoolClosedDays', 'schoolWeeklyOffDays', 'schoolWeekendDays'];
const weeklyColorKeys = ['weeklyColor', 'weeklyOffColor', 'weeklyHolidayColor', 'weeklyHolidaysColor', 'weekendColor', 'weekendDayColor', 'holidayColor', 'closedDayColor', 'schoolClosedDayColor', 'schoolWeeklyOffColor', 'attendanceHolidayColor'];
const settingsData = async (institutionId: any) => SiteSetting.find({ institutionId, key: { $in: ['app_control_settings', 'site_config', 'holiday_settings', 'attendance_settings', 'settings'] } }).lean();
const settingsWeeklyDays = async (institutionId: any) => { const settings = await settingsData(institutionId); for (const setting of settings) { const found = findByKeys(setting.value, weeklyDayKeys); if (found !== undefined) return normalizeWeeklyDays(found); } return [5, 6]; };
const settingsWeeklyColor = async (institutionId: any) => { const settings = await settingsData(institutionId); for (const setting of settings) { const found = findByKeys(setting.value, weeklyColorKeys); if (isHex(found)) return String(found).trim(); } return '#64748b'; };
const parseDateOnly = (value?: string) => { if (!value) return new Date(); const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/); if (!match) return new Date(value); return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])); };
const dateOnly = (value?: string) => { const date = parseDateOnly(value); return new Date(date.getFullYear(), date.getMonth(), date.getDate()); };
const endOfDate = (value?: string) => { const date = parseDateOnly(value); return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999); };
const isoLocal = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const rangeHoliday = (title: string, titleBn: string, startDate: string, endDate: string, type: HolidaySeed['type'], color: string, description?: string): HolidaySeed => ({ title, titleBn, startDate, endDate, type, color, description });
const defaultBangladeshHolidays = (year: number): HolidaySeed[] => [
  rangeHoliday('Shaheed Day and International Mother Language Day', 'শহীদ দিবস ও আন্তর্জাতিক মাতৃভাষা দিবস', `${year}-02-21`, `${year}-02-21`, 'government', '#ef4444'),
  rangeHoliday('Independence and National Day', 'স্বাধীনতা ও জাতীয় দিবস', `${year}-03-26`, `${year}-03-26`, 'government', '#16a34a'),
  rangeHoliday('Bengali New Year', 'পহেলা বৈশাখ', `${year}-04-14`, `${year}-04-14`, 'government', '#f97316'),
  rangeHoliday('May Day', 'মে দিবস', `${year}-05-01`, `${year}-05-01`, 'government', '#64748b'),
  rangeHoliday('Victory Day', 'বিজয় দিবস', `${year}-12-16`, `${year}-12-16`, 'government', '#16a34a'),
  rangeHoliday('Christmas Day', 'বড়দিন', `${year}-12-25`, `${year}-12-25`, 'religious', '#dc2626'),
];
const weekendHolidays = (year: number, weeklyDays: number[] = [], weeklyColor = '#64748b'): HolidaySeed[] => {
  const items: HolidaySeed[] = [];
  const cursor = new Date(year, 0, 1);
  const last = new Date(year, 11, 31);
  while (cursor <= last) {
    if (weeklyDays.includes(cursor.getDay())) {
      const iso = isoLocal(cursor);
      const dayName = cursor.toLocaleDateString('en-US', { weekday: 'long' });
      items.push({ title: `Weekly Holiday - ${dayName}`, titleBn: `সাপ্তাহিক ছুটি - ${dayName}`, startDate: iso, endDate: iso, type: 'weekend', color: weeklyColor, description: `Weekly school holiday (${dayName}).` });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return items;
};
const holidayPayload = (item: HolidaySeed, institutionId: any, year: number, createdBy?: any) => ({ ...item, startDate: dateOnly(item.startDate), endDate: endOfDate(item.endDate), isSchoolClosed: true, isEnabled: true, source: 'bangladesh_default', academicYear: String(year), institutionId, createdBy });
const ensureBangladeshHolidays = async (institutionId: any, year: number, createdBy?: any, includeWeekends = true, weeklyDays: number[] = [], weeklyColor = '#64748b') => {
  const finalWeeklyDays = weeklyDays.length ? weeklyDays : [5, 6];
  await Holiday.deleteMany({ institutionId, academicYear: String(year), source: 'bangladesh_default', type: 'weekend' });
  const source = [...defaultBangladeshHolidays(year), ...(includeWeekends ? weekendHolidays(year, finalWeeklyDays, weeklyColor) : [])];
  let upserted = 0;
  for (const item of source) {
    const payload = holidayPayload(item, institutionId, year, createdBy);
    await Holiday.findOneAndUpdate({ institutionId, title: item.title, startDate: payload.startDate }, { $set: { ...payload, color: item.color } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    upserted += 1;
  }
  return { created: upserted, skipped: false, weeklyDays: finalWeeklyDays, weeklyColor };
};

router.get('/', authenticate, async (req: any, res) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const autoSeed = req.query.autoSeed !== 'false';
    const weeklyDays = req.query.weeklyDays ? normalizeWeeklyDays(req.query.weeklyDays) : await settingsWeeklyDays(req.user.institutionId);
    const weeklyColor = isHex(req.query.weeklyColor) ? String(req.query.weeklyColor) : await settingsWeeklyColor(req.user.institutionId);
    if (autoSeed) await ensureBangladeshHolidays(req.user.institutionId, year, req.user._id, true, weeklyDays, weeklyColor);
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);
    const query: any = { institutionId: req.user.institutionId, startDate: { $lte: end }, endDate: { $gte: start } };
    if (req.query.type) query.type = req.query.type;
    const holidays = await Holiday.find(query).sort({ startDate: 1, title: 1 }).lean();
    res.json({ holidays, autoSeeded: autoSeed, weeklyDays: weeklyDays.length ? weeklyDays : [5, 6], weeklyColor });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to load holidays', error: { name: error?.name, code: error?.code, message: error?.message } });
  }
});

router.get('/check', authenticate, async (req: any, res) => {
  try {
    const targetDate = req.query.date as string | undefined;
    const year = targetDate ? parseDateOnly(targetDate).getFullYear() : new Date().getFullYear();
    const weeklyDays = await settingsWeeklyDays(req.user.institutionId);
    const weeklyColor = await settingsWeeklyColor(req.user.institutionId);
    await ensureBangladeshHolidays(req.user.institutionId, year, req.user._id, true, weeklyDays, weeklyColor);
    const date = dateOnly(targetDate);
    const holiday = await Holiday.findOne({ institutionId: req.user.institutionId, isEnabled: { $ne: false }, isSchoolClosed: true, startDate: { $lte: endOfDate(targetDate) }, endDate: { $gte: date } }).lean();
    res.json({ isHoliday: !!holiday, holiday, weeklyDays, weeklyColor });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to check holiday', error });
  }
});

router.post('/seed/bangladesh', authenticate, async (req: any, res) => {
  try {
    if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can seed holidays.' });
    const year = Number(req.body.year || req.query.year || new Date().getFullYear());
    const weeklyDays = normalizeWeeklyDays(req.body.weeklyDays ?? await settingsWeeklyDays(req.user.institutionId));
    const weeklyColor = isHex(req.body.weeklyColor) ? String(req.body.weeklyColor) : await settingsWeeklyColor(req.user.institutionId);
    const result = await ensureBangladeshHolidays(req.user.institutionId, year, req.user._id, req.body.includeWeekends !== false, weeklyDays, weeklyColor);
    res.json({ message: 'Bangladesh holidays synced.', ...result });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to seed holidays', error: { name: error?.name, code: error?.code, message: error?.message } });
  }
});

router.patch('/bulk-status', authenticate, async (req: any, res) => {
  try {
    if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can manage holidays.' });
    const year = String(req.body.year || new Date().getFullYear());
    const isEnabled = req.body.isEnabled !== false;
    const result = await Holiday.updateMany({ institutionId: req.user.institutionId, academicYear: year }, { $set: { isEnabled, isSchoolClosed: isEnabled } });
    res.json({ message: isEnabled ? 'All holidays enabled.' : 'All holidays disabled.', modified: result.modifiedCount || 0 });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to update all holidays', error });
  }
});

router.post('/', authenticate, async (req: any, res) => {
  try {
    if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can manage holidays.' });
    const start = req.body.startDate || req.body.date;
    const end = req.body.endDate || start;
    const item = await Holiday.findOneAndUpdate({ institutionId: req.user.institutionId, title: req.body.title, startDate: dateOnly(start) }, { $set: { ...req.body, startDate: dateOnly(start), endDate: endOfDate(end), source: req.body.source || 'institution_custom', academicYear: String(req.body.academicYear || dateOnly(start).getFullYear()), institutionId: req.user.institutionId, createdBy: req.user._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.status(201).json({ holiday: item });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to create holiday', error: { name: error?.name, code: error?.code, message: error?.message } });
  }
});

router.put('/:id', authenticate, async (req: any, res) => {
  try {
    if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can manage holidays.' });
    const payload: any = { ...req.body };
    if (payload.startDate) payload.startDate = dateOnly(payload.startDate);
    if (payload.endDate) payload.endDate = endOfDate(payload.endDate);
    const holiday = await Holiday.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, payload, { new: true });
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });
    res.json({ holiday });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to update holiday', error });
  }
});

router.delete('/:id', authenticate, async (req: any, res) => {
  try {
    if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can manage holidays.' });
    await Holiday.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, { $set: { isEnabled: false, isSchoolClosed: false } });
    res.json({ message: 'Holiday disabled' });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to delete holiday', error });
  }
});

export default router;
