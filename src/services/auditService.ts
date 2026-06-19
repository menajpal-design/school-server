import { Request } from 'express';
import AuditLog from '../models/AuditLog';

export const writeAuditLog = async (req: Request, action: string, resource: string, resourceId?: any, newValues?: any, oldValues?: any) => {
  if (!req.user?._id || !req.user?.institutionId) return;
  await AuditLog.create({
    userId: req.user._id,
    action,
    resource,
    resourceId,
    oldValues,
    newValues,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    institutionId: req.user.institutionId,
  });
};
