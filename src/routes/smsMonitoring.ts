import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import SmsLog from '../models/SmsLog';
import Parent from '../models/Parent';
import Institution from '../models/Institution';
import getTenantIdFromReq from '../utils/tenant';

const router = Router();

// Get all SMS logs for an institution (Admin, Head, Assistant Head, Finance Officer)
router.get('/sms-monitoring', authenticate, authorize('admin', 'super_admin', 'head', 'assistant_head', 'finance_officer', 'staff'), async (req: Request, res: Response) => {
  try {
    const { status, parentId, studentId, type, startDate, endDate } = req.query;
    const userId = (req as any).user?.id;
    
    // Resolve tenant/institution id
    const tenantId = getTenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ error: 'Institution not found' });

    const filter: any = { institutionId: tenantId };

    if (status) {
      filter.status = status;
    }
    if (parentId) {
      filter.parentId = parentId;
    }
    if (studentId) {
      filter.studentId = studentId;
    }
    if (type) {
      filter.type = type;
    }
    if (startDate || endDate) {
      filter.sentAt = {};
      if (startDate) {
        filter.sentAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        filter.sentAt.$lte = new Date(endDate as string);
      }
    }

    const smsLogs = await SmsLog.find(filter)
      .populate('parentId', 'userId')
      .populate('studentId', 'name')
      .sort({ sentAt: -1 })
      .limit(500);

    // Enrich with parent user details
    const enrichedLogs = await Promise.all(
      smsLogs.map(async (log) => {
        const logObj = log.toObject();
        if (logObj.parentId) {
          const parent = await Parent.findById(logObj.parentId).populate('userId', 'name email phone');
          // logObj.parentDetails = parent; // TODO: fix type issues
        }
        return logObj;
      })
    );

    res.json({
      total: smsLogs.length,
      data: enrichedLogs,
    });
  } catch (error) {
    console.error('Error fetching SMS logs:', error);
    res.status(500).json({ error: 'Failed to fetch SMS logs' });
  }
});

// Get SMS logs for a specific parent
router.get('/sms-monitoring/parent/:parentId', authenticate, authorize('admin', 'super_admin', 'head', 'assistant_head', 'finance_officer', 'staff'), async (req: Request, res: Response) => {
  try {
    const { parentId } = req.params;
    const tenantId = getTenantIdFromReq(req);
    const user = (req as any).user;

    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({ error: 'Parent not found' });
    }

    const smsLogs = await SmsLog.find({
      institutionId: tenantId,
      parentId,
    })
      .populate('studentId', 'name')
      .sort({ sentAt: -1 });

    const summaryByStatus = {
      sent: 0,
      failed: 0,
      delivered: 0,
      pending: 0,
    };

    smsLogs.forEach((log) => {
      summaryByStatus[log.status as keyof typeof summaryByStatus]++;
    });

    res.json({
      parent: {
        id: parent._id,
        children: parent.children || [],
      },
      summary: summaryByStatus,
      logs: smsLogs,
    });
  } catch (error) {
    console.error('Error fetching parent SMS logs:', error);
    res.status(500).json({ error: 'Failed to fetch parent SMS logs' });
  }
});

// Get SMS statistics for dashboard
router.get('/sms-monitoring/stats', authenticate, authorize('admin', 'super_admin', 'head', 'assistant_head', 'finance_officer'), async (req: Request, res: Response) => {
  try {
    const { days = 30 } = req.query;
    const tenantId = getTenantIdFromReq(req);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));

    const stats = await SmsLog.aggregate([
      {
        $match: {
          institutionId: tenantId,
          sentAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const typeBreakdown = await SmsLog.aggregate([
      {
        $match: {
          institutionId: tenantId,
          sentAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
        },
      },
    ]);

    const totalSent = await SmsLog.countDocuments({
      institutionId: tenantId,
      sentAt: { $gte: startDate },
    });

    res.json({
      period: `Last ${days} days`,
      totalSent,
      statusBreakdown: stats,
      typeBreakdown,
    });
  } catch (error) {
    console.error('Error fetching SMS stats:', error);
    res.status(500).json({ error: 'Failed to fetch SMS statistics' });
  }
});

export default router;
