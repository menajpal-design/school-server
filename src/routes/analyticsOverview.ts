import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import LoginLog from '../models/LoginLog';
import PageView from '../models/PageView';
import Institution from '../models/Institution';
import User from '../models/User';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import Attendance from '../models/Attendance';
import mongoose from 'mongoose';
import { runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
router.use(authenticate);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);

const getDateRange = (dateStr?: string) => {
  const base =
    dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? new Date(dateStr + 'T00:00:00.000Z')
      : new Date();
  const start = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
};

const buildDailyTrend = (agg: any[], days: number) => {
  const map = new Map<string, number>();
  for (const item of agg) map.set(item._id, item.count);
  const result: { date: string; visits: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().split('T')[0];
    result.push({ date: key, visits: map.get(key) || 0 });
  }
  return result;
};

const clientIp = (req: any) =>
  String(req.headers['x-forwarded-for'] || req.ip || '')
    .split(',')[0]
    .trim();

router.post('/page-view', async (req: any, res) => {
  try {
    const path = String(req.body?.path || '').split('?')[0].trim();
    if (!path || path.startsWith('/api')) return res.json({ tracked: false });
    const institutionId = req.user?.institutionId;
    if (!institutionId || !mongoose.Types.ObjectId.isValid(String(institutionId))) {
      return res.json({ tracked: false });
    }

    const now = new Date();
    const recentSince = new Date(now.getTime() - 20 * 1000);
    const userId = new mongoose.Types.ObjectId(String(req.user._id || req.user.id));
    const institutionObjectId = new mongoose.Types.ObjectId(String(institutionId));
    const recent = await primaryDb(() => PageView.findOne({
      userId,
      institutionId: institutionObjectId,
      path,
      viewedAt: { $gte: recentSince },
    }).select('_id').lean());
    if (recent) return res.json({ tracked: false, deduped: true });

    await primaryDb(() => PageView.create({
      userId,
      institutionId: institutionObjectId,
      name: req.user?.name,
      username: req.user?.username,
      role: req.user?.role || 'user',
      path,
      title: String(req.body?.title || '').slice(0, 160),
      referrer: String(req.body?.referrer || '').slice(0, 300),
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] || ''),
      viewedAt: now,
    }));
    return res.status(201).json({ tracked: true });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to track page view', error });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ADMIN / SUPER_ADMIN  ->  All schools overview (Google Analytics style)
//   GET /api/analytics/schools-overview
//   Query: ?date=YYYY-MM-DD  &  days=7|14|30  &  search=  &  page=  &  limit=
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get(
  '/schools-overview',
  authorize('admin', 'super_admin'),
  async (req, res) => {
    try {
      const { start, end } = getDateRange(String(req.query.date || ''));
      const days = Math.min(90, Math.max(1, Number(req.query.days || 30)));
      const trendSince = new Date(Date.now() - days * 86400000);
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(200, Number(req.query.limit || 50));
      const skip = (page - 1) * limit;
      const search = String(req.query.search || '').trim();

      // 1. Platform-wide totals
      const [totalViews, todayViews, totalLogins, todayLogins, totalSchools, activeSchools] = await Promise.all([
        primaryDb(() => PageView.countDocuments({})),
        primaryDb(() => PageView.countDocuments({ viewedAt: { $gte: start, $lt: end } })),
        primaryDb(() => LoginLog.countDocuments({})),
        primaryDb(() => LoginLog.countDocuments({ loginAt: { $gte: start, $lt: end } })),
        primaryDb(() => Institution.countDocuments({})),
        primaryDb(() => Institution.countDocuments({ isActive: true })),
      ]);

      // 2. Role breakdown (platform-wide today page views)
      const roleBreakdown = await primaryDb(() =>
        PageView.aggregate([
          { $match: { viewedAt: { $gte: start, $lt: end } } },
          { $group: { _id: '$role', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
      );

      // 3. Daily trend (last N days, platform-wide)
      const trendAgg = await primaryDb(() =>
        PageView.aggregate([
          { $match: { viewedAt: { $gte: trendSince } } },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$viewedAt', timezone: '+06:00' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      );
      const dailyTrend = buildDailyTrend(trendAgg, days);

      // 4. Per-school list with visit counts
      const schoolQuery: any = {};
      if (search) {
        const pattern = new RegExp(search, 'i');
        schoolQuery.$or = [
          { name: pattern },
          { email: pattern },
          { phone: pattern },
          { eiin: pattern },
        ];
      }

      const [schools, schoolsTotal] = await Promise.all([
        primaryDb(() =>
          Institution.find(schoolQuery)
            .select('name email phone eiin isActive type billing createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        ),
        primaryDb(() => Institution.countDocuments(schoolQuery)),
      ]);

      const schoolIds = (schools as any[]).map((s: any) => s._id);

      // Aggregate login (visit) counts per school
      const [allTimeVisits, todayVisits, trendVisits, loginVisits, stuArr, tchArr, stfArr] = await Promise.all([
        primaryDb(() =>
          PageView.aggregate([
            { $match: { institutionId: { $in: schoolIds } } },
            { $group: { _id: '$institutionId', count: { $sum: 1 } } },
          ]),
        ),
        primaryDb(() =>
          PageView.aggregate([
            { $match: { institutionId: { $in: schoolIds }, viewedAt: { $gte: start, $lt: end } } },
            { $group: { _id: '$institutionId', count: { $sum: 1 } } },
          ]),
        ),
        primaryDb(() =>
          PageView.aggregate([
            { $match: { institutionId: { $in: schoolIds }, viewedAt: { $gte: trendSince } } },
            { $group: { _id: '$institutionId', count: { $sum: 1 } } },
          ]),
        ),
        primaryDb(() =>
          LoginLog.aggregate([
            { $match: { institutionId: { $in: schoolIds } } },
            { $group: { _id: '$institutionId', count: { $sum: 1 } } },
          ]),
        ),
        Student.aggregate([
          { $match: { institutionId: { $in: schoolIds } } },
          { $group: { _id: '$institutionId', count: { $sum: 1 } } },
        ]),
        Teacher.aggregate([
          { $match: { institutionId: { $in: schoolIds } } },
          { $group: { _id: '$institutionId', count: { $sum: 1 } } },
        ]),
        Staff.aggregate([
          { $match: { institutionId: { $in: schoolIds } } },
          { $group: { _id: '$institutionId', count: { $sum: 1 } } },
        ]),
      ]);

      const toMap = (arr: any[]) =>
        arr.reduce(
          (acc: any, item: any) => ({ ...acc, [String(item._id)]: item.count || 0 }),
          {},
        );

      const allTimeMap = toMap(allTimeVisits as any[]);
      const todayMap = toMap(todayVisits as any[]);
      const trendMap = toMap(trendVisits as any[]);
      const loginMap = toMap(loginVisits as any[]);
      const stuMap = toMap(stuArr);
      const tchMap = toMap(tchArr);
      const stfMap = toMap(stfArr);

      const rows = (schools as any[]).map((school: any) => {
        const id = String(school._id);
        return {
          _id: school._id,
          name: school.name,
          email: school.email,
          phone: school.phone,
          eiin: school.eiin,
          type: school.type,
          isActive: school.isActive,
          billingStatus: school.billing?.billingStatus || 'unknown',
          planName: school.billing?.planName || 'N/A',
          createdAt: school.createdAt,
          visits: {
            allTime: allTimeMap[id] || 0,
            today: todayMap[id] || 0,
            lastNDays: trendMap[id] || 0,
            logins: loginMap[id] || 0,
          },
          members: {
            students: stuMap[id] || 0,
            teachers: tchMap[id] || 0,
            staff: stfMap[id] || 0,
          },
        };
      });

      res.json({
        summary: {
          totalSchools,
          activeSchools,
          totalViews,
          todayViews,
          totalLogins,
          todayLogins,
          date: start.toISOString().split('T')[0],
          days,
        },
        roleBreakdown,
        dailyTrend,
        schools: {
          rows,
          total: schoolsTotal,
          page,
          limit,
          totalPages: Math.ceil(schoolsTotal / limit),
        },
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to load schools analytics overview', error });
    }
  },
);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ADMIN/SUPER_ADMIN -> Single school detailed analytics
//   GET /api/analytics/schools/:id
//   Query: ?days=30
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get(
  '/schools/:id',
  authorize('admin', 'super_admin'),
  async (req, res) => {
    try {
      const schoolId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(schoolId))
        return res.status(400).json({ message: 'Invalid school id' });

      const objectId = new mongoose.Types.ObjectId(schoolId);
      const days = Math.min(90, Math.max(1, Number(req.query.days || 30)));
      const since = new Date(Date.now() - days * 86400000);
      const { start: todayStart, end: todayEnd } = getDateRange();

      const school = await primaryDb(() =>
        Institution.findById(objectId)
          .select('name email phone eiin type isActive billing settings createdAt')
          .lean(),
      );
      if (!school) return res.status(404).json({ message: 'School not found' });

      const [totalVisits, todayVisits, totalLogins, roleTotals, dailyAgg, students, teachers, staff, users, recentViews] =
        await Promise.all([
          primaryDb(() => PageView.countDocuments({ institutionId: objectId })),
          primaryDb(() =>
            PageView.countDocuments({
              institutionId: objectId,
              viewedAt: { $gte: todayStart, $lt: todayEnd },
            }),
          ),
          primaryDb(() => LoginLog.countDocuments({ institutionId: objectId })),
          primaryDb(() =>
            PageView.aggregate([
              { $match: { institutionId: objectId } },
              { $group: { _id: '$role', total: { $sum: 1 }, lastView: { $max: '$viewedAt' } } },
              { $sort: { total: -1 } },
            ]),
          ),
          primaryDb(() =>
            PageView.aggregate([
              { $match: { institutionId: objectId, viewedAt: { $gte: since } } },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$viewedAt',
                      timezone: '+06:00',
                    },
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ]),
          ),
          Student.countDocuments({ institutionId: objectId }),
          Teacher.countDocuments({ institutionId: objectId }),
          Staff.countDocuments({ institutionId: objectId }),
          primaryDb(() => User.countDocuments({ institutionId: objectId })),
          primaryDb(() =>
            PageView.find({ institutionId: objectId }).sort({ viewedAt: -1 }).limit(50).lean(),
          ),
        ]);

      const dailyTrend = buildDailyTrend(dailyAgg, days);

      res.json({
        school,
        summary: {
          totalVisits,
          todayVisits,
          totalLogins,
          days,
          members: { students, teachers, staff, users },
        },
        roleTotals,
        dailyTrend,
        recentViews,
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to load school analytics', error });
    }
  },
);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// HEAD -> Own school visiting system (Google Analytics style)
//   GET /api/analytics/my-school/visits
//   Query: ?date=YYYY-MM-DD  &  days=7|14|30  &  role=
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get(
  '/my-school/visits',
  authorize('head', 'assistant_head', 'admin', 'super_admin'),
  async (req, res) => {
    try {
      const institutionId = req.user.institutionId;
      const objectId = new mongoose.Types.ObjectId(String(institutionId));

      const { start, end } = getDateRange(String(req.query.date || ''));
      const days = Math.min(90, Math.max(1, Number(req.query.days || 30)));
      const trendSince = new Date(Date.now() - days * 86400000);
      const roleFilter = String(req.query.role || '').trim();

      const matchBase: any = { institutionId: objectId };
      if (roleFilter) matchBase.role = roleFilter;

      const [totalVisits, todayVisits, totalLogins, roleBreakdown, dailyAgg, topVisitors] = await Promise.all([
        primaryDb(() => PageView.countDocuments(matchBase)),
        primaryDb(() =>
          PageView.countDocuments({ ...matchBase, viewedAt: { $gte: start, $lt: end } }),
        ),
        primaryDb(() => LoginLog.countDocuments(matchBase)),
        // Role breakdown with today's count included
        primaryDb(() =>
          PageView.aggregate([
            { $match: matchBase },
            {
              $group: {
                _id: '$role',
                total: { $sum: 1 },
                today: {
                  $sum: {
                    $cond: [
                      { $and: [{ $gte: ['$viewedAt', start] }, { $lt: ['$viewedAt', end] }] },
                      1,
                      0,
                    ],
                  },
                },
                lastView: { $max: '$viewedAt' },
              },
            },
            { $sort: { total: -1 } },
          ]),
        ),
        // Daily trend (last N days)
        primaryDb(() =>
          PageView.aggregate([
            { $match: { ...matchBase, viewedAt: { $gte: trendSince } } },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$viewedAt',
                    timezone: '+06:00',
                  },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ]),
        ),
        // Top visitors (most frequent page views in last N days)
        primaryDb(() =>
          PageView.aggregate([
            { $match: { ...matchBase, viewedAt: { $gte: trendSince } } },
            {
              $group: {
                _id: '$userId',
                name: { $last: '$name' },
                role: { $last: '$role' },
                count: { $sum: 1 },
                lastView: { $max: '$viewedAt' },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 20 },
          ]),
        ),
      ]);

      const dailyTrend = buildDailyTrend(dailyAgg, days);

      // Attendance overview for today
      const todayAttendance = await Attendance.aggregate([
        {
          $match: {
            institutionId: objectId,
            date: { $gte: start, $lt: end },
          },
        },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      const attMap = todayAttendance.reduce(
        (acc: any, item: any) => ({ ...acc, [item._id]: item.count }),
        {} as Record<string, number>,
      );
      const attendanceSummary = {
        present: (attMap as any)['present'] || 0,
        absent: (attMap as any)['absent'] || 0,
        late: (attMap as any)['late'] || 0,
        leave: (attMap as any)['leave'] || 0,
        total: Object.values(attMap).reduce((s: any, v: any) => s + v, 0),
      };

      // Hourly heatmap for today
      const hourlyAgg = await primaryDb(() =>
        PageView.aggregate([
          { $match: { ...matchBase, viewedAt: { $gte: start, $lt: end } } },
          {
            $group: {
              _id: { $hour: { date: '$viewedAt', timezone: '+06:00' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      );
      const hourlyMap = (hourlyAgg as any[]).reduce(
        (acc: any, item: any) => ({ ...acc, [item._id]: item.count }),
        {} as Record<number, number>,
      );
      const hourlyHeatmap = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        count: (hourlyMap as any)[h] || 0,
      }));

      res.json({
        institutionId,
        date: start.toISOString().split('T')[0],
        days,
        summary: {
          totalVisits,
          todayVisits,
          totalLogins,
          attendanceSummary,
        },
        roleBreakdown,
        dailyTrend,
        hourlyHeatmap,
        topVisitors,
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to load school visiting analytics', error });
    }
  },
);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// HEAD / ADMIN -> Recent logins for the current school (paginated)
//   GET /api/analytics/my-school/recent-logins
//   Query: ?role=  &  page=  &  limit=  &  date=
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get(
  '/my-school/recent-logins',
  authorize('head', 'assistant_head', 'admin', 'super_admin'),
  async (req, res) => {
    try {
      const institutionId = req.user.institutionId;
      const objectId = new mongoose.Types.ObjectId(String(institutionId));
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(200, Number(req.query.limit || 50));
      const skip = (page - 1) * limit;

      const filter: any = { institutionId: objectId };
      if (req.query.role) filter.role = String(req.query.role);
      if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date))) {
        const { start, end } = getDateRange(String(req.query.date));
        filter.loginAt = { $gte: start, $lt: end };
      }

      const [logs, total] = await Promise.all([
        primaryDb(() =>
          LoginLog.find(filter).sort({ loginAt: -1 }).skip(skip).limit(limit).lean(),
        ),
        primaryDb(() => LoginLog.countDocuments(filter)),
      ]);

      res.json({
        logs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to load recent logins', error });
    }
  },
);

export default router;

