import { Request } from 'express';

// Central helper to determine current tenant (institution) id from request
export const getTenantIdFromReq = (req: Request & any): string | undefined => {
  // Prefer tenant middleware resolution
  if (req.institutionId) return String(req.institutionId);
  if (req.institution && req.institution._id) return String(req.institution._id);
  // Then prefer user context
  if (req.user && req.user.institutionId) return String(req.user.institutionId);
  // Then header
  const header = req.header && (req.header('x-institution-id') || req.header('x-school-id'));
  if (header) return String(header);
  return undefined;
};

export default getTenantIdFromReq;
