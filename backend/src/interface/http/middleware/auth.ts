import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors';
import { env } from '../../../shared/env';

export interface AuthPayload {
  userId: string;
  role: string;
  typ?: 'user' | 'admin';
}

declare global {
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
    const payload = jwt.verify(token, env().JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'fixly',
      audience: ['fixly-app', 'fixly-admin'], // reject tokens without a known audience
    }) as AuthPayload;
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
