import express from 'express';
import { authenticate } from '../middleware/auth';
import Holiday from '../models/Holiday';
import SiteSetting from '../models/SiteSetting';

const router = express.Router();
const manageRoles = ['head', 'assistant_head', 'admin', 'super_admin'];
const canManageHolidays = (role: string) => manageRoles.includes(role);
type HolidaySeed = { title: string; titleBn: string; startDate: string; endDate: string; type: 'government' | 'religious' | 'school' | 'weekend' | 'custom'; color: string; description?: string; };
const DEFAULT_WEEKLY_DAYS = [5, 6];
const dayNameMap: Record<string, number> = { sunday: 0, sun: 0, saturday: 6, sat: 6, friday: 5, fri: 5, thursday: 4, thu: 4, wednesday: 3, wed: 3, tuesday: 2, tue: 2, monday: 1, mon: 1, 'রবিবার': 0, 'শনিবার': 6, 'শুক্রবার': 5, 'বৃহস্পতিবার': 4, 'বুধবার': 3, 'মঙ্গলবার': 2, 'সোমবার': 1 };
const normalizeWeeklyDays = (value: any): number[] => {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : DEFAULT_WEEKLY_DAYS;
  const days = raw.map((item: any) => typeof item === 'number' ? item : dayNameMap[String(item).trim().toLowerCase()] ?? Number(item)).filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6);
  const unique = Array.from(new Set(days));
  return unique.length ? unique : DEFAULT_WEEKLY_DAYS;
};
const findWeeklyDays = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of ['weeklyDays', 'weeklyOffDays', 'weeklyHolidays', 'weekendDays', 'weekends', 'offDays', 'schoolClosedDays']) if (obj[key] !== undefined) return obj[key];
  for (const value of Object.values(obj)) { const found = findWeeklyDays(value); if (found !== undefined) return found; }
  return undefined;
};
const settingsWeeklyDays = async (institutionId: any) => {
  const settings = await SiteSetting.find({ institutionId, key: { $in: ['app_control_settings', 'site_config', 'holiday_settings', 'attendance_settings'] } }).lean();
  for (const setting of settings) { const found = findWeeklyDays(setting.value); if (found !== undefined) return normalizeWeeklyDays(found); }
  return DEFAULT_WEEKLY_DAYS;
};
const parseDateOnly = (value?: string) => { if (!value) return new Date(); const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!match) return new Date(value); return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])); };
const dateOnly = (value?: string) => { const date = parseDateOnly(value); return new Date(date.getFullYear(), date.getMonth(), date.getDate()); };
const endOfDate = (value?: string) => { const date = parseDateOnly(value); return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999); };
const rangeHoliday = (title: string, titleBn: string, startDate: string, endDate: string, type: HolidaySeed['type'], color: string, description?: string): HolidaySeed => ({ title, titleBn, startDate, endDate, type, color, description });
const defaultBangladeshHolidays = (year: number): HolidaySeed[] => [rangeHoliday('Shaheed Day and International Mother Language Day', 'শহীদ দিবস', `${year}-02-21`, `${year}-02-21`, 'government', '#ef4444'), rangeHoliday('Independence and National Day', 'স্বাধীনতা দিবস', `${year}-03-26`, `${year}-03-26`, 'government', '#16a34a'), rangeHoliday('Bengali New Year', 'পহেলা বৈশাখ', `${year}-04-14`, `${year}-04-14`, 'government', '#f97316'), rangeHoliday('May Day', 'মে দিবস', `${year}-05-01`, `${year}-05-01`, 'government', '#64748b'), rangeHoliday('Victory Day', 'বিজয় দিবস', `${year}-12-16`, `${year}-12-16`, 'government', '#16a34a'), rangeHoliday('Christmas Day', 'বড়দিন', `${year}-12-25`, `${year}-12-25`, 'religious', '#dc2626')];
const weekendHolidays = (year: number, weeklyDays: number[] = DEFAULT_WEEKLY_DAYS): HolidaySeed[] => {
  const items: HolidaySeed[] = [];
  for (let d = new Date(year, 0, 1); d <= new Date(year, 11, 31); d.setDate(d.getDate() + 1)) {
    if (weeklyDays.includes(d.getDay())) { const iso = d.toISOString().slice(0, 10); const dayName = d.toLocaleDateString('en-US', { weekday: 'long' }); items.push({ title: `Weekly Holiday - ${dayName}`, titleBn: `সাপ্তাহিক ছুটি - ${dayName}`, startDate: iso, endDate: iso, type: 'weekend', color: '#64748b', description: `Weekly school holiday (${dayName}).` }); }
  }
  return items;
};
const ensureBangladeshHolidays = async (institutionId: any, year: number, createdBy?: any, includeWeekends = true, weeklyDays: number[] = DEFAULT_WEEKLY_DAYS) => {
  await Holiday.deleteMany({ institutionId, academicYear: String(year), source: 'bangladesh_default', type: 'weekend' });
  const existingGov = await Holiday.countDocuments({ institutionId, academicYear: String(year), source: 'bangladesh_default', type: { $ne: 'weekend' } });
  const source = [...(existingGov ? [] : defaultBangladeshHolidays(year)), ...(includeWeekends ? weekendHolidays(year, weeklyDays) : [])];
  let created = 0;
  for (const item of source) { await Holiday.findOneAndUpdate({ institutionId, title: item.title, startDate: dateOnly(item.startDate) }, { $setOnInsert: { ...item, startDate: dateOnly(item.startDate), endDate: endOfDate(item.endDate), isSchoolClosed: true, isEnabled: true, source: 'bangladesh_default', academicYear: String(year), institutionId, createdBy } }, { upsert: true, new: true, setDefaultsOnInsert: true }); created += 1; }
  return { created, skipped: false };
};
router.get('/', authenticate, async (req: any, res) => {
  try { const year = Number(req.query.year || new Date().getFullYear()); const autoSeed = req.query.autoSeed !== 'false'; const weeklyDays = req.query.weeklyDays ? normalizeWeeklyDays(req.query.weeklyDays) : await settingsWeeklyDays(req.user.institutionId); if (autoSeed) await ensureBangladeshHolidays(req.user.institutionId, year, req.user._id, true, weeklyDays); const start = new Date(year, 0, 1); const end = new Date(year, 11, 31, 23, 59, 59, 999); const query: any = { institutionId: req.user.institutionId, startDate: { $lte: end }, endDate: { $gte: start } }; if (req.query.type) query.type = req.query.type; const holidays = await Holiday.find(query).sort({ startDate: 1 }).lean(); res.json({ holidays, autoSeeded: autoSeed, weeklyDays }); } catch (error) { res.status(500).json({ message: 'Failed to load holidays', error }); }
});
router.get('/check', authenticate, async (req: any, res) => {
  try { const targetDate = req.query.date as string | undefined; const year = targetDate ? parseDateOnly(targetDate).getFullYear() : new Date().getFullYear(); const weeklyDays = await settingsWeeklyDays(req.user.institutionId); await ensureBangladeshHolidays(req.user.institutionId, year, req.user._id, true, weeklyDays); const date = dateOnly(targetDate); const holiday = await Holiday.findOne({ institutionId: req.user.institutionId, isEnabled: { $ne: false }, isSchoolClosed: true, startDate: { $lte: endOfDate(targetDate) }, endDate: { $gte: date } }).lean(); res.json({ isHoliday: !!holiday, holiday, weeklyDays }); } catch (error) { res.status(500).json({ message: 'Failed to check holiday', error }); }
});
router.post('/seed/bangladesh', authenticate, async (req: any, res) => {
  try { if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can seed holidays.' }); const year = Number(req.body.year || req.query.year || new Date().getFullYear()); const weeklyDays = normalizeWeeklyDays(req.body.weeklyDays || await settingsWeeklyDays(req.user.institutionId)); const result = await ensureBangladeshHolidays(req.user.institutionId, year, req.user._id, req.body.includeWeekends !== false, weeklyDays); res.json({ message: 'Bangladesh holidays synced.', ...result, weeklyDays }); } catch (error) { res.status(500).json({ message: 'Failed to seed holidays', error }); }
});
router.post('/', authenticate, async (req: any, res) => { try { if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can manage holidays.' }); const item = await Holiday.create({ ...req.body, institutionId: req.user.institutionId, createdBy: req.user._id }); res.status(201).json({ holiday: item }); } catch (error) { res.status(500).json({ message: 'Failed to create holiday', error }); } });
router.put('/:id', authenticate, async (req: any, res) => { try { if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can manage holidays.' }); const holiday = await Holiday.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, req.body, { new: true }); if (!holiday) return res.status(404).json({ message: 'Holiday not found' }); res.json({ holiday }); } catch (error) { res.status(500).json({ message: 'Failed to update holiday', error }); } });
router.delete('/:id', authenticate, async (req: any, res) => { try { if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can manage holidays.' }); await Holiday.findOneAndDelete({ _id: req.params.id, institutionId: req.user.institutionId }); res.json({ message: 'Holiday deleted' }); } catch (error) { res.status(500).json({ message: 'Failed to delete holiday', error }); } });
export default router;
