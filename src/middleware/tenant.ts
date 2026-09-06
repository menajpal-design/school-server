import { Request, Response, NextFunction } from 'express';
import Institution from '../models/Institution';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeHost = (host: string) => String(host || '').split(':')[0].trim().replace(/^www\./i, '').toLowerCase();

const findInstitutionByLegacyHost = async (host: string) => {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return null;

  return Institution.findOne({
    isActive: true,
    $or: [
      { domains: normalizedHost },
      { domains: `www.${normalizedHost}` },
      { website: new RegExp(`^https?://(www\\.)?${escapeRegExp(normalizedHost)}(/|$)`, 'i') },
    ],
  })
    .select('_id name isActive domains subdomain')
    .lean()
    .exec();
};

// Extract subdomain from Host header and resolve Institution
export default async function resolveTenant(req: Request & any, res: Response, next: NextFunction) {
  try {
    const headerHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0] || '';
    const mainDomain = (process.env.MAIN_DOMAIN || '').toLowerCase();
    const hostParts = headerHost.split('.').filter(Boolean);
    let subdomain = '';

    if (!headerHost || process.env.ENABLE_SUBDOMAINS === 'false') return next();

    const normalizedHeaderHost = normalizeHost(headerHost);
    if (
      normalizedHeaderHost.includes('vercel.app') ||
      normalizedHeaderHost.includes('onrender.com') ||
      normalizedHeaderHost.includes('herokuapp.com') ||
      normalizedHeaderHost.includes('railway.app')
    ) {
      return next();
    }

    if (mainDomain && headerHost.endsWith(mainDomain)) {
      const suffix = mainDomain.split('.').length;
      if (hostParts.length > suffix) {
        subdomain = hostParts.slice(0, hostParts.length - suffix).join('.');
      }
    } else if (headerHost.endsWith('localhost') || headerHost.endsWith('127.0.0.1')) {
      if (hostParts.length > 1) {
        subdomain = hostParts.slice(0, hostParts.length - 1).join('.');
      }
    } else {
      // fallback: treat anything with 3+ parts as subdomain
      if (hostParts.length >= 3) subdomain = hostParts.slice(0, hostParts.length - 2).join('.');
    }

    if (!subdomain) return next();

    // normalize and disallow common reserved names
    subdomain = String(subdomain).toLowerCase();
    if (['www', 'app', 'api', 'admin'].includes(subdomain)) return next();

    let institution = await Institution.findOne({ subdomain }).select('_id name isActive domains subdomain').lean().exec();
    if (!institution) {
      institution = await findInstitutionByLegacyHost(headerHost);
    }

    if (!institution) {
      // don't fail for unknown subdomain; let handlers decide (404 on specific APIs)
      (req as any).institution = null;
      return next();
    }

    (req as any).institution = institution;
    (req as any).institutionId = institution._id;

    const canonicalHost = institution.subdomain && mainDomain ? `${institution.subdomain}.${mainDomain}` : '';
    const currentHost = normalizeHost(headerHost);
    const shouldRedirect = req.method === 'GET'
      && !req.originalUrl.startsWith('/api')
      && String(req.headers.accept || '').includes('text/html');

    if (canonicalHost && currentHost !== canonicalHost && shouldRedirect) {
      const protocol = String(req.protocol || 'https');
      return res.redirect(301, `${protocol}://${canonicalHost}${req.originalUrl}`);
    }

    return next();
  } catch (err) {
    return next(err);
  }
}
