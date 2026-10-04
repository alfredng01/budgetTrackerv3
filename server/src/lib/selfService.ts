import type { Request, RequestHandler } from 'express';
import { env } from '../env.js';

/**
 * Cloudflare adds CF-Connecting-IP to every request it forwards through a tunnel, and clients
 * can't set it themselves at Cloudflare's edge. Its absence means the request came from the LAN.
 * (A LAN client could add the header, but that only locks itself out.)
 */
const viaTunnel = (req: Request) => req.headers['cf-connecting-ip'] !== undefined;

/** Whether this request may use the Sign up form and the unverified password reset. */
export function selfServiceAllowed(req: Request): boolean {
  if (env.SIGNUP_AND_RESET === 'everywhere') return true;
  if (env.SIGNUP_AND_RESET === 'off') return false;
  return !viaTunnel(req);
}

export const requireSelfService: RequestHandler = (req, res, next) => {
  if (selfServiceAllowed(req)) {
    next();
    return;
  }
  res.status(403).json({
    error: 'Sign up and password reset are only available on the home network',
    message: 'Sign up and password reset are only available on the home network',
  });
};
