import { Center, Loader } from '@mantine/core';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { useMe } from './lib/queries';
import { AccountsPage } from './pages/AccountsPage';
import { AllowancePage } from './pages/AllowancePage';
import { BudgetsPage } from './pages/BudgetsPage';
import { CreditCardsPage } from './pages/CreditCardsPage';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { IncomePage } from './pages/IncomePage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';

export function App() {
  const { data: me, isLoading } = useMe();

  if (isLoading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (!me) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout user={me} />}>
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="income" element={<IncomePage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="credit-cards" element={<CreditCardsPage />} />
        <Route path="allowance" element={<AllowancePage />} />
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
