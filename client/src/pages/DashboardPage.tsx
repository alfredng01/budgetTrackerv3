import { useState } from 'react';
import { Alert, Button, Card, Center, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconFileSpreadsheet, IconFileUpload, IconPlus } from '@tabler/icons-react';
import { BudgetBars } from '../components/BudgetBars';
import { CategoryBreakdown } from '../components/CategoryBreakdown';
import { CsvImportModal } from '../components/import/CsvImportModal';
import { ImportStatementModal } from '../components/import/ImportStatementModal';
import { IncomeModal } from '../components/IncomeModal';
import { StatTiles } from '../components/StatTiles';
import { TransactionModal } from '../components/TransactionModal';
import { ViewFilters } from '../components/ViewFilters';
import { useAllowance, useDashboard, useMe } from '../lib/queries';
import { todayIso, useViewParams } from '../lib/view';

export function DashboardPage() {
  const { data: me } = useMe();
  const { month, userId } = useViewParams();
  const { data, isLoading, error } = useDashboard(month, userId);
  const today = todayIso();
  const { data: allowance } = useAllowance(Number(today.slice(0, 4)), today, userId);
  // Shown for a single person only (the admin's "All users" view would mix allowances).
  const myAllowance = allowance?.length === 1 && allowance[0].weeklyCents > 0 ? allowance[0].remainingCents : null;
  const [modal, setModal] = useState<'txn' | 'income' | 'import' | 'csv' | null>(null);
  const canWrite = me?.role !== 'admin';

  return (
    <>
      <ViewFilters title="Dashboard" />

      {canWrite && (
        <Group mb="lg" gap="sm">
          <Button leftSection={<IconFileUpload size={16} />} onClick={() => setModal('import')}>
            Import statement
          </Button>
          <Button variant="default" leftSection={<IconFileSpreadsheet size={16} />} onClick={() => setModal('csv')}>
            Import CSV
          </Button>
          <Button variant="default" leftSection={<IconPlus size={16} />} onClick={() => setModal('txn')}>
            Add expense
          </Button>
          <Button variant="default" leftSection={<IconPlus size={16} />} onClick={() => setModal('income')}>
            Add income
          </Button>
        </Group>
      )}

      {error && <Alert color="red">{error.message}</Alert>}
      {isLoading || !data ? (
        <Center h={300}>
          <Loader />
        </Center>
      ) : (
        <Stack gap="lg">
          <StatTiles
            spentCents={data.spentCents}
            incomeCents={data.incomeCents}
            netCents={data.netCents}
            allowanceCents={myAllowance}
          />
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
            <Card>
              <Title order={4} mb="md">
                Spending by category
              </Title>
              <CategoryBreakdown data={data.byCategory} totalCents={data.spentCents} />
            </Card>
            <Card>
              <Title order={4}>Budgets</Title>
              <Text size="sm" c="dimmed" mb="md">
                Spending against your monthly limits
              </Text>
              <BudgetBars budgets={data.budgets} />
            </Card>
          </SimpleGrid>
        </Stack>
      )}

      <TransactionModal opened={modal === 'txn'} onClose={() => setModal(null)} />
      <IncomeModal opened={modal === 'income'} onClose={() => setModal(null)} />
      <ImportStatementModal opened={modal === 'import'} onClose={() => setModal(null)} />
      <CsvImportModal opened={modal === 'csv'} onClose={() => setModal(null)} />
    </>
  );
}
