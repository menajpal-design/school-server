import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import Institution from '../models/Institution';
import { expireInstitutionIfNeeded } from '../services/billingService';

interface AuthRequest extends Request {
  user: any;
}

const platformAdminRoles = ['admin', 'super_admin'];

const isPlatformAdminRole = (role?: string) => platformAdminRoles.includes(role || '');
const isPrivilegedRole = (role?: string) => role === 'head' || platformAdminRoles.includes(role || '');

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    const user = await User.findById(decoded.id).populate('institutionId');

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid token or user inactive.' });
    }

    const selectedInstitutionId = req.header('x-institution-id');
    if (selectedInstitutionId && platformAdminRoles.includes(user.role)) {
      const institution = await Institution.findById(selectedInstitutionId).select('_id');
      if (institution) {
        user.institutionId = institution._id as any;
      }
    }

    let institution = user.institutionId as any;
    institution = await expireInstitutionIfNeeded(institution);
    const platformAdmin = isPlatformAdminRole(user.role);
    const schoolActive = institution?.isActive !== false;
    const allowedInactivePaths = ['/api/auth/profile', '/api/institution/profile', '/api/institution/billing/payment', '/api/institution/plans'];
    if (!platformAdmin && !schoolActive && !allowedInactivePaths.includes(req.path) && !allowedInactivePaths.includes(req.originalUrl.split('?')[0])) {
      const message = user.role === 'head' ? 'আপনার অনুমতি নেই, আগে বিল পরিশোধ করুন।' : 'আপনার প্রতিষ্ঠান প্রধানের সাথে যোগাযোগ করুন।';
      return res.status(403).json({ message });
    }
    if (institution?._id) {
      user.institutionId = institution._id as any;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token.' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    if (isPlatformAdminRole(req.user.role)) return next();

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    next();
  };
};

export const checkPermission = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    // Head bypass
    if (isPrivilegedRole(req.user.role)) return next();

    if (!Array.isArray(req.user.permissions) || !req.user.permissions.includes(permission)) {
      return res.status(403).json({ message: 'Access denied. Permission required.' });
    }

    next();
  };
};

// Can access own data (or head / assistant_head)
export const canAccessOwnData = () => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });

    // Head can access all
    if (isPrivilegedRole(req.user.role)) return next();

    const targetId = req.params.id || req.body.userId || req.query.userId;
    if (!targetId) return res.status(400).json({ message: 'Target id required.' });

    // If same user
    if (String(req.user._id || req.user.id) === String(targetId)) return next();

    // Parents can access their children's ids stored in req.user.children (array)
    if (req.user.role === 'parent' && Array.isArray(req.user.children) && req.user.children.map(String).includes(String(targetId))) return next();

    return res.status(403).json({ message: 'Access denied. Can only access own data.' });
  };
};

// Assistant head or assigned managers: can access assigned area (if user.assignedAreas contains area)
export const canAccessAssignedArea = (areaParam = 'areaId') => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });

    if (isPrivilegedRole(req.user.role)) return next();
    if (req.user.role === 'assistant_head') {
      const area = req.params[areaParam] || req.body[areaParam] || req.query[areaParam];
      if (!area) return res.status(400).json({ message: 'Area id required.' });
      if (Array.isArray(req.user.assignedAreas) && req.user.assignedAreas.map(String).includes(String(area))) return next();
    }

    return res.status(403).json({ message: 'Access denied. Assigned area required.' });
  };
};

// ID Card related permissions
export const canManageIDCard = () => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    if (isPrivilegedRole(req.user.role)) return next();
    const allowed = ['assistant_head', 'finance_officer', 'staff']
    if (allowed.includes(req.user.role) || (Array.isArray(req.user.permissions) && req.user.permissions.includes('manage:idcard'))) return next();
    return res.status(403).json({ message: 'Access denied. Manage ID cards.' });
  };
};

export const canScanIDCard = () => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    if (['student', 'parent'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Students and parents cannot scan ID cards.' });
    }
    if (isPrivilegedRole(req.user.role)) return next();
    const allowed = ['assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff'];
    const permissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    const scanPermissions = ['scan:idcard', 'manage:idcard', 'manage:academic', 'manage:finance'];
    if (allowed.includes(req.user.role) || scanPermissions.some((permission) => permissions.includes(permission))) return next();
    return res.status(403).json({ message: 'Access denied. Cannot scan ID cards.' });
  };
};

export const canDownloadIDCard = () => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    if (isPrivilegedRole(req.user.role)) return next();
    if (['assistant_head', 'class_teacher', 'subject_teacher', 'staff', 'student', 'teacher', 'parent'].includes(req.user.role)) return next();
    // Students and parents can download own/child card
    const targetId = req.params.id || req.query.id || req.body.userId;
    if (String(req.user._id || req.user.id) === String(targetId)) return next();
    if (req.user.role === 'parent' && Array.isArray(req.user.children) && req.user.children.map(String).includes(String(targetId))) return next();
    // others with permission
    if (Array.isArray(req.user.permissions) && req.user.permissions.includes('download:idcard')) return next();
    return res.status(403).json({ message: 'Access denied. Cannot download ID card.' });
  };
};

export const canGenerateIDCard = () => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    if (isPrivilegedRole(req.user.role)) return next();
    const allowed = ['assistant_head', 'staff', 'finance_officer', 'class_teacher']
    if (allowed.includes(req.user.role) || (Array.isArray(req.user.permissions) && req.user.permissions.includes('generate:idcard'))) return next();
    return res.status(403).json({ message: 'Access denied. Cannot generate ID card.' });
  };
};

export const canEditIDCard = () => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    if (isPrivilegedRole(req.user.role)) return next();
    const allowed = ['assistant_head', 'staff']
    if (allowed.includes(req.user.role) || (Array.isArray(req.user.permissions) && req.user.permissions.includes('edit:idcard'))) return next();
    return res.status(403).json({ message: 'Access denied. Cannot edit ID card.' });
  };
};

export const canManageFinance = () => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    if (isPrivilegedRole(req.user.role)) return next();
    if (req.user.role === 'finance_officer' || (Array.isArray(req.user.permissions) && req.user.permissions.includes('manage:finance'))) return next();
    return res.status(403).json({ message: 'Access denied. Finance management only.' });
  };
};

export const canManageAcademic = () => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    if (isPrivilegedRole(req.user.role)) return next();
    const allowed = ['class_teacher', 'subject_teacher', 'assistant_head']
    if (allowed.includes(req.user.role) || (Array.isArray(req.user.permissions) && req.user.permissions.includes('manage:academic'))) return next();
    return res.status(403).json({ message: 'Access denied. Academic management only.' });
  };
};

export const canPostNotice = () => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    if (isPrivilegedRole(req.user.role)) return next();
    const allowed = ['assistant_head', 'committee_member', 'staff']
    if (allowed.includes(req.user.role) || (Array.isArray(req.user.permissions) && req.user.permissions.includes('post:notice'))) return next();
    return res.status(403).json({ message: 'Access denied. Cannot post notice.' });
  };
};
