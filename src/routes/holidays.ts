import express from 'express';
import { authenticate } from '../middleware/auth';
import Holiday from '../models/Holiday';

const router = express.Router();

const manageRoles = ['head', 'assistant_head', 'admin', 'super_admin'];
const canManageHolidays = (role: string) => manageRoles.includes(role);

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

const defaultBangladeshHolidays = (year: number) => [
  { title: 'International Mother Language Day', titleBn: 'শহীদ দিবস ও আন্তর্জাতিক মাতৃভাষা দিবস', startDate: `${year}-02-21`, endDate: `${year}-02-21`, type: 'government', color: '#ef4444' },
  { title: 'Shab-e-Barat', titleBn: 'শবে বরাত', startDate: `${year}-02-15`, endDate: `${year}-02-15`, type: 'religious', color: '#8b5cf6' },
  { title: 'Independence Day', titleBn: 'স্বাধীনতা দিবস', startDate: `${year}-03-26`, endDate: `${year}-03-26`, type: 'government', color: '#16a34a' },
  { title: 'Jumatul Wida', titleBn: 'জুমাতুল বিদা', startDate: `${year}-03-20`, endDate: `${year}-03-20`, type: 'religious', color: '#8b5cf6' },
  { title: 'Shab-e-Qadr', titleBn: 'শবে কদর', startDate: `${year}-03-21`, endDate: `${year}-03-21`, type: 'religious', color: '#8b5cf6' },
  { title: 'Eid-ul-Fitr Holiday', titleBn: 'ঈদুল ফিতর ছুটি', startDate: `${year}-03-22`, endDate: `${year}-03-24`, type: 'religious', color: '#0ea5e9' },
  { title: 'Bengali New Year', titleBn: 'বাংলা নববর্ষ', startDate: `${year}-04-14`, endDate: `${year}-04-14`, type: 'government', color: '#f97316' },
  { title: 'May Day', titleBn: 'মে দিবস', startDate: `${year}-05-01`, endDate: `${year}-05-01`, type: 'government', color: '#64748b' },
  { title: 'Buddha Purnima', titleBn: 'বুদ্ধ পূর্ণিমা', startDate: `${year}-05-01`, endDate: `${year}-05-01`, type: 'religious', color: '#f59e0b' },
  { title: 'Eid-ul-Adha Holiday', titleBn: 'ঈদুল আযহা ছুটি', startDate: `${year}-05-27`, endDate: `${year}-05-31`, type: 'religious', color: '#0ea5e9' },
  { title: 'Ashura', titleBn: 'আশুরা', startDate: `${year}-06-26`, endDate: `${year}-06-26`, type: 'religious', color: '#8b5cf6' },
  { title: 'Janmashtami', titleBn: 'জন্মাষ্টমী', startDate: `${year}-08-15`, endDate: `${year}-08-15`, type: 'religious', color: '#f59e0b' },
  { title: 'Eid-e-Miladunnabi', titleBn: 'ঈদে মিলাদুন্নবী', startDate: `${year}-08-25`, endDate: `${year}-08-25`, type: 'religious', color: '#8b5cf6' },
  { title: 'Durga Puja', titleBn: 'দুর্গাপূজা', startDate: `${year}-10-20`, endDate: `${year}-10-20`, type: 'religious', color: '#f59e0b' },
  { title: 'Victory Day', titleBn: 'বিজয় দিবস', startDate: `${year}-12-16`, endDate: `${year}-12-16`, type: 'government', color: '#16a34a' },
  { title: 'Christmas Day', titleBn: 'বড়দিন', startDate: `${year}-12-25`, endDate: `${year}-12-25`, type: 'religious', color: '#dc2626' },
];

const weekendHolidays = (year: number, weeklyDays: number[] = [5]): any[] => {
  const items: any[] = [];
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (weeklyDays.includes(d.getDay())) {
      const iso = d.toISOString().slice(0, 10);
      items.push({ title: 'Weekly Holiday', titleBn: 'সাপ্তাহিক ছুটি', startDate: iso, endDate: iso, type: 'weekend', color: '#64748b' });
    }
  }
  return items;
};

router.get('/', authenticate, async (req: any, res) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);
    const query: any = { institutionId: req.user.institutionId, startDate: { $lte: end }, endDate: { $gte: start } };
    if (req.query.type) query.type = req.query.type;
    const holidays = await Holiday.find(query).sort({ startDate: 1 }).lean();
    res.json({ holidays });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load holidays', error });
  }
});

router.get('/check', authenticate, async (req: any, res) => {
  try {
    const date = dateOnly(req.query.date as string | undefined);
    const holiday = await Holiday.findOne({
      institutionId: req.user.institutionId,
      isSchoolClosed: true,
      startDate: { $lte: endOfDate(req.query.date as string | undefined) },
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
    const weeklyDays = Array.isArray(req.body.weeklyDays) ? req.body.weeklyDays.map(Number) : [5];
    const source = [...defaultBangladeshHolidays(year), ...(includeWeekends ? weekendHolidays(year, weeklyDays) : [])];
    let upserted = 0;
    for (const item of source) {
      await Holiday.findOneAndUpdate(
        { institutionId: req.user.institutionId, title: item.title, startDate: dateOnly(item.startDate) },
        { $set: { ...item, startDate: dateOnly(item.startDate), endDate: endOfDate(item.endDate), isSchoolClosed: true, academicYear: String(year), institutionId: req.user.institutionId, createdBy: req.user._id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      upserted += 1;
    }
    res.status(201).json({ message: 'Bangladesh holiday list seeded. Please review religious moon-based dates and edit if needed.', year, upserted });
  } catch (error) {
    res.status(500).json({ message: 'Failed to seed Bangladesh holidays', error });
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
    const holiday = await Holiday.findOneAndDelete({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!holiday) return res.status(404).json({ message: 'Holiday not found' });
    res.json({ message: 'Holiday deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete holiday', error });
  }
});

export default router;
