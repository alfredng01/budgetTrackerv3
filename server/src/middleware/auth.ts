import type { RequestHandler, Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import type { SessionUser } from '@budget/shared';
import { auth } from '../auth.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    const u = session.user as typeof session.user & { username?: string | null; role?: string };
    req.user = {
      id: u.id,
      username: u.username ?? u.name,
      name: u.name,
      role: u.role === 'admin' ? 'admin' : 'user',
    };
    next();
  } catch (err) {
    next(err);
  }
};

/** The admin account is a read-only overview; it never owns or edits data. */
export const requireWriter: RequestHandler = (req, res, next) => {
  if (req.user?.role === 'admin') {
    res.status(403).json({ error: 'The admin account is read-only' });
    return;
  }
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  next();
};

/**
 * Which user's data a read request covers.
 * Regular users always see only their own data; the admin may pass ?userId= or see everyone (null).
 */
export function readScope(req: Request): string | null {
  const user = req.user!;
  if (user.role !== 'admin') return user.id;
  const requested = typeof req.query.userId === 'string' ? req.query.userId : '';
  return requested || null;
}
