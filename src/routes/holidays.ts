import express from 'express';
import { authenticate } from '../middleware/auth';
import Holiday from '../models/Holiday';

const router = express.Router();

const manageRoles = ['head', 'assistant_head', 'admin', 'super_admin'];
const canManageHolidays = (role: string) => manageRoles.includes(role);

type HolidaySeed = {
  title: string;
  titleBn: string;
  startDate: string;
  endDate: string;
  type: 'government' | 'religious' | 'school' | 'weekend' | 'custom';
  color: string;
  description?: string;
};

const DEFAULT_WEEKLY_DAYS = [5, 6]; // Bangladesh school default: Friday + Saturday

const normalizeWeeklyDays = (value: any): number[] => {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : DEFAULT_WEEKLY_DAYS;
  const days = raw.map((item: any) => Number(item)).filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6);
  const unique = Array.from(new Set(days));
  return unique.length ? unique : DEFAULT_WEEKLY_DAYS;
};

const parseDateOnly = (value?: string) => {
  if (!value) return new Date();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const dateOnly = (value?: string) => {
  const date = parseDateOnly(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const endOfDate = (value?: string) => {
  const date = parseDateOnly(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
};

const rangeHoliday = (title: string, titleBn: string, startDate: string, endDate: string, type: HolidaySeed['type'], color: string, description?: string): HolidaySeed => ({ title, titleBn, startDate, endDate, type, color, description });

const defaultBangladeshHolidays = (year: number): HolidaySeed[] => {
  if (year === 2026) {
    return [
      rangeHoliday('Shab-e-Barat', 'শবে বরাত', '2026-02-04', '2026-02-04', 'religious', '#8b5cf6', 'Executive order holiday.'),
      rangeHoliday('Shaheed Day and International Mother Language Day', 'শহীদ দিবস ও আন্তর্জাতিক মাতৃভাষা দিবস', '2026-02-21', '2026-02-21', 'government', '#ef4444', 'General holiday.'),
      rangeHoliday('Shab-e-Qadr', 'শবে কদর', '2026-03-17', '2026-03-17', 'religious', '#8b5cf6', 'Executive order holiday.'),
      rangeHoliday('Eid-ul-Fitr Holiday', 'ঈদুল ফিতর ছুটি', '2026-03-18', '2026-03-23', 'religious', '#0ea5e9', 'Executive/general Eid holiday block including additional declared holiday.'),
      rangeHoliday('Jumatul Bida', 'জুমাতুল বিদা', '2026-03-20', '2026-03-20', 'religious', '#8b5cf6', 'General holiday; overlaps Eid holiday block.'),
      rangeHoliday('Eid-ul-Fitr', 'ঈদুল ফিতর', '2026-03-21', '2026-03-21', 'religious', '#0ea5e9', 'General Eid holiday; overlaps Eid holiday block.'),
      rangeHoliday('Independence and National Day', 'স্বাধীনতা ও জাতীয় দিবস', '2026-03-26', '2026-03-26', 'government', '#16a34a', 'General holiday.'),
      rangeHoliday('Chaitra Sankranti', 'চৈত্র সংক্রান্তি', '2026-04-13', '2026-04-13', 'government', '#f97316', 'Editable Bangladesh school/bank holiday item.'),
      rangeHoliday('Bengali New Year', 'বাংলা নববর্ষ / পহেলা বৈশাখ', '2026-04-14', '2026-04-14', 'government', '#f97316', 'Executive order holiday.'),
      rangeHoliday('May Day', 'মে দিবস', '2026-05-01', '2026-05-01', 'government', '#64748b', 'General holiday.'),
      rangeHoliday('Buddha Purnima', 'বুদ্ধ পূর্ণিমা', '2026-05-01', '2026-05-01', 'religious', '#f59e0b', 'General holiday; overlaps May Day.'),
      rangeHoliday('Eid-ul-Adha Holiday', 'ঈদুল আযহা ছুটি', '2026-05-26', '2026-05-31', 'religious', '#0ea5e9', 'Executive/general Eid-ul-Adha holiday block.'),
      rangeHoliday('Eid-ul-Adha', 'ঈদুল আযহা', '2026-05-28', '2026-05-28', 'religious', '#0ea5e9', 'General Eid-ul-Adha holiday; overlaps Eid-ul-Adha holiday block.'),
      rangeHoliday('Ashura', 'আশুরা', '2026-06-26', '2026-06-26', 'religious', '#8b5cf6', 'Executive order holiday.'),
      rangeHoliday('Mass Uprising Day', 'গণঅভ্যুত্থান দিবস', '2026-08-05', '2026-08-05', 'government', '#16a34a', 'General holiday.'),
      rangeHoliday('Eid-e-Miladunnabi (PBUH)', 'ঈদে মিলাদুন্নবী (সা.)', '2026-08-26', '2026-08-26', 'religious', '#8b5cf6', 'General holiday.'),
      rangeHoliday('Janmashtami', 'জন্মাষ্টমী', '2026-09-04', '2026-09-04', 'religious', '#f59e0b', 'General holiday.'),
      rangeHoliday('Durga Puja Holiday', 'দুর্গাপূজা ছুটি', '2026-10-20', '2026-10-21', 'religious', '#f59e0b', 'Mahanabami and Bijoya Dashami holiday block.'),
      rangeHoliday('Durga Puja Bijoya Dashami', 'দুর্গাপূজা / বিজয়া দশমী', '2026-10-21', '2026-10-21', 'religious', '#f59e0b', 'General holiday; overlaps Durga Puja holiday block.'),
      rangeHoliday('Victory Day', 'বিজয় দিবস', '2026-12-16', '2026-12-16', 'government', '#16a34a', 'General holiday.'),
      rangeHoliday('Christmas Day', 'বড়দিন', '2026-12-25', '2026-12-25', 'religious', '#dc2626', 'General holiday.'),
    ];
  }

  return [
    rangeHoliday('Shaheed Day and International Mother Language Day', 'শহীদ দিবস ও আন্তর্জাতিক মাতৃভাষা দিবস', `${year}-02-21`, `${year}-02-21`, 'government', '#ef4444'),
    rangeHoliday('Independence and National Day', 'স্বাধীনতা ও জাতীয় দিবস', `${year}-03-26`, `${year}-03-26`, 'government', '#16a34a'),
    rangeHoliday('Bengali New Year', 'বাংলা নববর্ষ / পহেলা বৈশাখ', `${year}-04-14`, `${year}-04-14`, 'government', '#f97316'),
    rangeHoliday('May Day', 'মে দিবস', `${year}-05-01`, `${year}-05-01`, 'government', '#64748b'),
    rangeHoliday('Mass Uprising Day', 'গণঅভ্যুত্থান দিবস', `${year}-08-05`, `${year}-08-05`, 'government', '#16a34a'),
    rangeHoliday('Victory Day', 'বিজয় দিবস', `${year}-12-16`, `${year}-12-16`, 'government', '#16a34a'),
    rangeHoliday('Christmas Day', 'বড়দিন', `${year}-12-25`, `${year}-12-25`, 'religious', '#dc2626'),
  ];
};

const weekendHolidays = (year: number, weeklyDays: number[] = DEFAULT_WEEKLY_DAYS): HolidaySeed[] => {
  const selectedDays = normalizeWeeklyDays(weeklyDays);
  const items: HolidaySeed[] = [];
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (selectedDays.includes(d.getDay())) {
      const iso = d.toISOString().slice(0, 10);
      const dayName = d.getDay() === 5 ? 'Friday' : d.getDay() === 6 ? 'Saturday' : d.toLocaleDateString('en-US', { weekday: 'long' });
      const dayNameBn = d.getDay() === 5 ? 'শুক্রবার' : d.getDay() === 6 ? 'শনিবার' : 'সাপ্তাহিক ছুটি';
      items.push({ title: `Weekly Holiday - ${dayName}`, titleBn: `সাপ্তাহিক ছুটি - ${dayNameBn}`, startDate: iso, endDate: iso, type: 'weekend', color: '#64748b', description: `Weekly school holiday (${dayName}).` });
    }
  }
  return items;
};

const ensureBangladeshHolidays = async (institutionId: any, year: number, createdBy?: any, includeWeekends = true, weeklyDays: number[] = DEFAULT_WEEKLY_DAYS) => {
  const existingCount = await Holiday.countDocuments({ institutionId, academicYear: String(year), source: 'bangladesh_default' });
  if (existingCount > 0) return { created: 0, skipped: true };
  const source = [...defaultBangladeshHolidays(year), ...(includeWeekends ? weekendHolidays(year, weeklyDays) : [])];
  let created = 0;
  for (const item of source) {
    await Holiday.findOneAndUpdate(
      { institutionId, title: item.title, startDate: dateOnly(item.startDate) },
      { $setOnInsert: { ...item, startDate: dateOnly(item.startDate), endDate: endOfDate(item.endDate), isSchoolClosed: true, isEnabled: true, source: 'bangladesh_default', academicYear: String(year), institutionId, createdBy } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    created += 1;
  }
  return { created, skipped: false };
};

router.get('/', authenticate, async (req: any, res) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const autoSeed = req.query.autoSeed !== 'false';
    const weeklyDays = normalizeWeeklyDays(req.query.weeklyDays || DEFAULT_WEEKLY_DAYS);
    if (autoSeed) await ensureBangladeshHolidays(req.user.institutionId, year, req.user._id, true, weeklyDays);
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);
    const query: any = { institutionId: req.user.institutionId, startDate: { $lte: end }, endDate: { $gte: start } };
    if (req.query.type) query.type = req.query.type;
    const holidays = await Holiday.find(query).sort({ startDate: 1 }).lean();
    res.json({ holidays, autoSeeded: autoSeed, weeklyDays });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load holidays', error });
  }
});

router.get('/check', authenticate, async (req: any, res) => {
  try {
    const targetDate = req.query.date as string | undefined;
    const year = targetDate ? parseDateOnly(targetDate).getFullYear() : new Date().getFullYear();
    await ensureBangladeshHolidays(req.user.institutionId, year, req.user._id, true, DEFAULT_WEEKLY_DAYS);
    const date = dateOnly(targetDate);
    const holiday = await Holiday.findOne({
      institutionId: req.user.institutionId,
      isEnabled: { $ne: false },
      isSchoolClosed: true,
      startDate: { $lte: endOfDate(targetDate) },
      endDate: { $gte: date },
    }).lean();
    res.json({ isHoliday: !!holiday, holiday });
  } catch (error) {
    res.status(500).json({ message: 'Failed to check holiday', error });
  }
});

router.post('/seed/bangladesh', authenticate, async (req: any, res) => {
  try {
    if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can seed holidays.' });
    const year = Number(req.body.year || req.query.year || new Date().getFullYear());
    const includeWeekends = req.body.includeWeekends !== false;
    const weeklyDays = normalizeWeeklyDays(req.body.weeklyDays || DEFAULT_WEEKLY_DAYS);

    await Holiday.deleteMany({ institutionId: req.user.institutionId, academicYear: String(year), source: 'bangladesh_default' });

    const source = [...defaultBangladeshHolidays(year), ...(includeWeekends ? weekendHolidays(year, weeklyDays) : [])];
    let upserted = 0;
    for (const item of source) {
      await Holiday.findOneAndUpdate(
        { institutionId: req.user.institutionId, title: item.title, startDate: dateOnly(item.startDate) },
        { $set: { ...item, startDate: dateOnly(item.startDate), endDate: endOfDate(item.endDate), isSchoolClosed: true, isEnabled: true, source: 'bangladesh_default', academicYear: String(year), institutionId: req.user.institutionId, createdBy: req.user._id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      upserted += 1;
    }
    res.status(201).json({ message: `Bangladesh holiday list updated. Weekly holiday: ${weeklyDays.includes(5) ? 'Friday' : ''}${weeklyDays.includes(5) && weeklyDays.includes(6) ? ' + ' : ''}${weeklyDays.includes(6) ? 'Saturday' : ''}. Head can disable any holiday or all holidays.`, year, upserted, weeklyDays });
  } catch (error) {
    res.status(500).json({ message: 'Failed to seed Bangladesh holidays', error });
  }
});

router.patch('/bulk-status', authenticate, async (req: any, res) => {
  try {
    if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can update holidays.' });
    const year = Number(req.body.year || new Date().getFullYear());
    const isEnabled = req.body.isEnabled !== false;
    const result = await Holiday.updateMany({ institutionId: req.user.institutionId, academicYear: String(year), source: 'bangladesh_default' }, { $set: { isEnabled, isSchoolClosed: isEnabled } });
    res.json({ message: isEnabled ? 'All Bangladesh holidays enabled.' : 'All Bangladesh holidays disabled/opened for school.', modified: result.modifiedCount || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update all holidays', error });
  }
});

router.post('/', authenticate, async (req: any, res) => {
  try {
    if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can add holidays.' });
    const holiday = await Holiday.create({
      title: req.body.title,
      titleBn: req.body.titleBn,
      type: req.body.type || 'custom',
      startDate: dateOnly(req.body.startDate),
      endDate: endOfDate(req.body.endDate || req.body.startDate),
      description: req.body.description,
      isSchoolClosed: req.body.isSchoolClosed !== false,
      isEnabled: req.body.isEnabled !== false,
      source: 'institution_custom',
      color: req.body.color || '#ef4444',
      academicYear: req.body.academicYear || String(new Date(req.body.startDate || Date.now()).getFullYear()),
      institutionId: req.user.institutionId,
      createdBy: req.user._id,
    });
    res.status(201).json({ holiday });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add holiday', error });
  }
});

router.put('/:id', authenticate, async (req: any, res) => {
  try {
    if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can update holidays.' });
    const update: any = { ...req.body };
    if (req.body.startDate) update.startDate = dateOnly(req.body.startDate);
    if (req.body.endDate || req.body.startDate) update.endDate = endOfDate(req.body.endDate || req.body.startDate);
    if (req.body.isEnabled === false) update.isSchoolClosed = false;
    const holiday = await Holiday.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, { $set: update }, { new: true });
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });
    res.json({ holiday });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update holiday', error });
  }
});

router.delete('/:id', authenticate, async (req: any, res) => {
  try {
    if (!canManageHolidays(req.user.role)) return res.status(403).json({ message: 'Only Head/Assistant/Admin can delete holidays.' });
    const holiday = await Holiday.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, { $set: { isEnabled: false, isSchoolClosed: false } }, { new: true });
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });
    res.json({ message: 'Holiday disabled for this institution', holiday });
  } catch (error) {
    res.status(500).json({ message: 'Failed to disable holiday', error });
  }
});

export default router;