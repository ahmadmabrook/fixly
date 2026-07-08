import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors';
import { verifyJwt } from '../../../shared/jwt';
import { prisma } from '../../../infrastructure/database/prisma';

export interface AuthPayload {
  userId: string;
  role: string;
  /** Fine-grained admin RBAC role (only present on admin-class tokens). */
  adminRole?: 'SUPER_ADMIN' | 'OPS' | 'FINANCE' | 'SUPPORT';
  typ?: 'user' | 'admin';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- idiomatic Express Request augmentation
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedError();

  const token = header.slice(7);
  try {
    const payload = verifyJwt<AuthPayload>(token, {
      issuer: 'fixly',
      audience: ['fixly-app', 'fixly-admin'], // reject tokens without a known audience
    });
    req.user = payload;
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) throw new ForbiddenError('Insufficient permissions');
    // Admin endpoints require an admin-class token, not just role=ADMIN.
    // This prevents a user-class token from ever satisfying the admin guard.
    if (roles.includes('ADMIN') && req.user.typ !== 'admin') {
      throw new ForbiddenError('Admin token required');
    }
    next();
  };
}

/**
 * Re-check the user is still active on state-changing routes. A blocked/deleted
 * user's access token stays valid until expiry (refresh is revoked, but the
 * short-lived access token isn't), so privileged mutations must re-verify the
 * live `isActive` flag. Mount AFTER `authenticate` on mutation routers.
 */
export function requireActiveUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    next(new UnauthorizedError());
    return;
  }
  // Only enforce on state-changing requests. A blocked user reading their OWN
  // data is harmless, so skip the per-request DB lookup on GET/HEAD (keeps the
  // tech-dashboard polls and other reads off the extra round-trip).
  if (req.method === 'GET' || req.method === 'HEAD') {
    next();
    return;
  }
  prisma.user
    .findUnique({ where: { id: req.user.userId }, select: { isActive: true } })
    .then((user) => {
      if (!user || !user.isActive) next(new ForbiddenError('Account is not active'));
      else next();
    })
    .catch(next);
}

/**
 * Fine-grained admin RBAC guard. Mount AFTER `authenticate`/`requireRole('ADMIN')`.
 * SUPER_ADMIN passes every gate; others must be in the allowed set. Use to scope
 * finance routes to FINANCE, support routes to SUPPORT, etc.
 */
export function requireAdminRole(...roles: Array<'SUPER_ADMIN' | 'OPS' | 'FINANCE' | 'SUPPORT'>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || req.user.typ !== 'admin') throw new UnauthorizedError();
    const adminRole = req.user.adminRole;
    if (adminRole === 'SUPER_ADMIN' || (adminRole && roles.includes(adminRole))) {
      return next();
    }
    throw new ForbiddenError('Insufficient admin role');
  };
}
