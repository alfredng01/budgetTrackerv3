import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { currentMonthKey } from '@budget/shared';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Month and (admin-only) user filter live in the URL so they survive reloads,
 * can be bookmarked, and carry across pages via nav links.
 */
export function useViewParams() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('month');
  const month = raw && MONTH_RE.test(raw) ? raw : currentMonthKey();
  const userId = params.get('user') || null;

  const update = useCallback(
    (patch: { month?: string; user?: string | null }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (patch.month !== undefined) next.set('month', patch.month);
          if (patch.user !== undefined) {
            if (patch.user) next.set('user', patch.user);
            else next.delete('user');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { month, userId, setMonth: (m: string) => update({ month: m }), setUser: (u: string | null) => update({ user: u }), search: params.toString() };
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A sensible default date for new entries: today if viewing the current month, else the 1st. */
export function defaultDateFor(month: string): string {
  return month === currentMonthKey() ? todayIso() : `${month}-01`;
}
