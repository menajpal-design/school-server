import express from 'express';
import LoginLog from '../models/LoginLog';
import Institution from '../models/Institution';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin', 'super_admin'));

const getDateRange = (date?: string) => {
  const base = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00.000Z') : new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
};

// GET /api/admin/login-logs/summary
// Overall platform summary: total logins, today's logins, per-role breakdown
router.get('/summary', async (req, res) => {
  try {
    const { start, end } = getDateRange(String(req.query.date || ''));

    const [totalLogins, todayLogins, roleSummary, institutionSummary] = await Promise.all([
      LoginLog.countDocuments({}),
      LoginLog.countDocuments({ loginAt: { $gte: start, $lt: end } }),
      LoginLog.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      LoginLog.aggregate([
        { $group: { _id: '$institutionId', count: { $sum: 1 }, todayCount: { $sum: { $cond: [{ $and: [{ $gte: ['$loginAt', start] }, { $lt: ['$loginAt', end] }] }, 1, 0] } } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
        { $lookup: { from: 'institutions', localField: '_id', foreignField: '_id', as: 'institution' } },
        { $unwind: { path: '$institution', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, institutionName: { $ifNull: ['$institution.name', 'Unknown'] }, count: 1, todayCount: 1 } },
      ]),
    ]);

    res.json({
      date: start.toISOString().split('T')[0],
      totalLogins,
      todayLogins,
      roleSummary,
      institutionSummary,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load login summary', error });
  }
});

// GET /api/admin/login-logs?institutionId=&date=&role=&page=&limit=
// Per-institution or global login log list
router.get('/', async (req, res) => {
  try {
    const { institutionId, role, date } = req.query;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Number(req.query.limit || 50));
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (institutionId) filter.institutionId = institutionId;
    if (role) filter.role = role;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      const { start, end } = getDateRange(String(date));
      filter.loginAt = { $gte: start, $lt: end };
    }

    const [logs, total] = await Promise.all([
      LoginLog.find(filter)
        .sort({ loginAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('institutionId', 'name')
        .lean(),
      LoginLog.countDocuments(filter),
    ]);

    const mapped = logs.map((log: any) => ({
      _id: log._id,
      userId: log.userId,
      name: log.name,
      username: log.username,
      email: log.email,
      role: log.role,
      ip: log.ip,
      userAgent: log.userAgent,
      loginAt: log.loginAt,
      institutionId: log.institutionId?._id || log.institutionId,
      institutionName: log.institutionId?.name || 'N/A',
    }));

    res.json({
      logs: mapped,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load login logs', error });
  }
});

// GET /api/admin/login-logs/institution/:id/daily
// Per-institution daily breakdown: how many students, teachers, staff logged in each day
router.get('/institution/:id/daily', async (req, res) => {
  try {
    const { id } = req.params;
    const days = Math.min(90, Number(req.query.days || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const institution = await Institution.findById(id).select('name').lean();
    if (!institution) return res.status(404).json({ message: 'Institution not found' });

    const [daily, roleTotals, recentLogs] = await Promise.all([
      LoginLog.aggregate([
        { $match: { institutionId: institution._id as any, loginAt: { $gte: since } } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$loginAt', timezone: '+06:00' } },
              role: '$role',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': -1 } },
      ]),
      LoginLog.aggregate([
        { $match: { institutionId: institution._id as any } },
        { $group: { _id: '$role', total: { $sum: 1 }, lastLogin: { $max: '$loginAt' } } },
        { $sort: { total: -1 } },
      ]),
      LoginLog.find({ institutionId: id })
        .sort({ loginAt: -1 })
        .limit(100)
        .lean(),
    ]);

    // Aggregate daily into {date, student, teacher, head, staff, parent, ...}
    const dateMap = new Map<string, Record<string, number>>();
    for (const item of daily) {
      const d = item._id.date;
      if (!dateMap.has(d)) dateMap.set(d, { date: d, total: 0 });
      const row = dateMap.get(d)!;
      row[item._id.role] = (row[item._id.role] || 0) + item.count;
      row.total = (row.total || 0) + item.count;
    }
    const dailyRows = Array.from(dateMap.values()).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    res.json({
      institutionId: id,
      institutionName: (institution as any).name,
      dailyBreakdown: dailyRows,
      roleTotals,
      recentLogs,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load institution login stats', error });
  }
});

export default router;
