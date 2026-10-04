import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import type {
  AccountActivity,
  AccountBalance,
  AllowanceInput,
  AllowanceSummary,
  BudgetRow,
  CardPaymentInput,
  DashboardSummary,
  Income,
  IncomeInput,
  Lookups,
  SessionUser,
  Transaction,
  PaymentsOverview,
  TransactionInput,
  TransferInput,
  YearSummary,
} from '@budget/shared';
import { api, ApiError, qs } from './api';

export const keys = {
  me: ['me'] as const,
  lookups: ['lookups'] as const,
  users: ['users'] as const,
  importStatus: ['import-status'] as const,
  // Everything below depends on month/user and is invalidated together after writes.
  data: ['data'] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api.get<SessionUser>('/api/account/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
  });
}

export const useLookups = () =>
  useQuery({ queryKey: keys.lookups, queryFn: () => api.get<Lookups>('/api/account/lookups'), staleTime: Infinity });

export const useUsers = (enabled: boolean) =>
  useQuery({
    queryKey: keys.users,
    queryFn: () => api.get<{ id: string; username: string }[]>('/api/account/users'),
    enabled,
  });

export const useImportStatus = () =>
  useQuery({ queryKey: keys.importStatus, queryFn: () => api.get<{ enabled: boolean }>('/api/import/status') });

export const useDashboard = (month: string, userId: string | null) =>
  useQuery({
    queryKey: [...keys.data, 'dashboard', month, userId],
    queryFn: () => api.get<DashboardSummary>(`/api/dashboard${qs({ month, userId })}`),
  });

export const useYear = (year: number, userId: string | null) =>
  useQuery({
    queryKey: [...keys.data, 'year', year, userId],
    queryFn: () => api.get<YearSummary>(`/api/dashboard/year${qs({ year, userId })}`),
  });

export const useTransactions = (month: string, userId: string | null) =>
  useQuery({
    queryKey: [...keys.data, 'transactions', month, userId],
    queryFn: () => api.get<Transaction[]>(`/api/transactions${qs({ month, userId })}`),
  });

export const useIncome = (month: string, userId: string | null) =>
  useQuery({
    queryKey: [...keys.data, 'income', month, userId],
    queryFn: () => api.get<Income[]>(`/api/income${qs({ month, userId })}`),
  });

export const useBudgets = (userId: string | null) =>
  useQuery({
    queryKey: [...keys.data, 'budgets', userId],
    queryFn: () => api.get<BudgetRow[]>(`/api/budgets${qs({ userId })}`),
  });

/** Wraps a write: invalidates all month-scoped data and shows an error toast on failure. */
function useWrite<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>, successMessage?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.data });
      if (successMessage) notifications.show({ color: 'teal', message: successMessage });
    },
    onError: (err) => notifications.show({ color: 'red', title: 'Something went wrong', message: err.message }),
  });
}

export const useSaveTransaction = () =>
  useWrite(({ id, input }: { id?: number; input: TransactionInput }) =>
    id ? api.put(`/api/transactions/${id}`, input) : api.post('/api/transactions', input),
  );

export const useImportCommit = () =>
  useWrite((body: { transactions: TransactionInput[]; payments: CardPaymentInput[] }) =>
    api.post<{ transactions: number; payments: number }>('/api/import/commit', body),
  );

export const useDeleteTransaction = () =>
  useWrite((id: number) => api.delete(`/api/transactions/${id}`), 'Transaction deleted');

export const useSaveIncome = () =>
  useWrite(({ id, input }: { id?: number; input: IncomeInput }) =>
    id ? api.put(`/api/income/${id}`, input) : api.post('/api/income', input),
  );

export const useDeleteIncome = () => useWrite((id: number) => api.delete(`/api/income/${id}`), 'Income deleted');

export const useSaveBudget = () =>
  useWrite(({ categoryId, limitCents }: { categoryId: number; limitCents: number | null }) =>
    api.put(`/api/budgets/${categoryId}`, { limitCents }),
  );

export const useAccounts = (userId: string | null) =>
  useQuery({
    queryKey: [...keys.data, 'accounts', userId],
    queryFn: () => api.get<AccountBalance[]>(`/api/accounts${qs({ userId })}`),
  });

export const useAccountActivity = (accountId: number | null, userId: string | null) =>
  useQuery({
    queryKey: [...keys.data, 'account-activity', accountId, userId],
    queryFn: () => api.get<AccountActivity[]>(`/api/accounts/${accountId}/activity${qs({ userId })}`),
    enabled: accountId !== null,
  });

export const useSetBalance = () =>
  useWrite(
    (body: { accountId: number; date: string; balanceCents: number }) => api.post('/api/accounts/set-balance', body),
    'Balance updated',
  );

export const useTransfer = () =>
  useWrite((body: TransferInput) => api.post('/api/accounts/transfer', body), 'Transfer recorded');

export const useDeleteAccountEntry = () =>
  useWrite((id: number) => api.delete(`/api/accounts/entries/${id}`), 'Entry removed');

export const usePayments = (userId: string | null) =>
  useQuery({
    queryKey: [...keys.data, 'payments', userId],
    queryFn: () => api.get<PaymentsOverview>(`/api/payments${qs({ userId })}`),
  });

export const useSavePayment = () =>
  useWrite((body: CardPaymentInput) => api.post('/api/payments', body), 'Payment recorded');

export const useDeletePayment = () => useWrite((id: number) => api.delete(`/api/payments/${id}`), 'Payment deleted');

export const useAllowance = (year: number, today: string, userId: string | null) =>
  useQuery({
    queryKey: [...keys.data, 'allowance', year, today, userId],
    queryFn: () => api.get<AllowanceSummary[]>(`/api/allowance${qs({ year, today, userId })}`),
  });

export const useSaveAllowance = () =>
  useWrite((body: AllowanceInput) => api.put('/api/allowance', body), 'Allowance saved');
