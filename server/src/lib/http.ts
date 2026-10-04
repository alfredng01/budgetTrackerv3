import type { Request } from 'express';
import { z } from 'zod';
import { currentMonthKey, monthKey } from '@budget/shared';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Validates `data` against `schema`, throwing a 400 with readable messages on failure. */
export function parseBody<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    throw new HttpError(400, msg);
  }
  return result.data;
}

export function monthParam(req: Request): string {
  const raw = typeof req.query.month === 'string' ? req.query.month : currentMonthKey();
  return parseBody(monthKey, raw);
}

export function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
}
