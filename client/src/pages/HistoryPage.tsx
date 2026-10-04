import { useState } from 'react';
import { ActionIcon, Anchor, Card, Center, Group, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { formatCents } from '@budget/shared';
import { UserFilter } from '../components/ViewFilters';
import { useYear } from '../lib/queries';
import { monthLabel, useViewParams } from '../lib/view';
import { SERIES } from '../theme';

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function HistoryPage() {
  const { month, userId } = useViewParams();
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const { data, isLoading } = useYear(year, userId);

  const chartData = (data?.months ?? []).map((m, i) => ({
    month: SHORT[i],
    Spent: m.spentCents / 100,
    Income: m.incomeCents / 100,
  }));
  const totals = (data?.months ?? []).reduce(
    (acc, m) => ({ spent: acc.spent + m.spentCents, income: acc.income + m.incomeCents }),
    { spent: 0, income: 0 },
  );
  const linkTo = (m: string) => {
    const sp = new URLSearchParams({ month: m });
    if (userId) sp.set('user', userId);
    return `/?${sp}`;
  };

  return (
    <>
      <Group justify="space-between" mb="lg" gap="sm">
        <Title order={2}>History</Title>
        <Group gap="xs">
          <ActionIcon variant="default" size="lg" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}>
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text fw={600} w={56} ta="center">
            {year}
          </Text>
          <ActionIcon variant="default" size="lg" aria-label="Next year" onClick={() => setYear((y) => y + 1)}>
            <IconChevronRight size={18} />
          </ActionIcon>
          <UserFilter />
        </Group>
      </Group>

      {isLoading || !data ? (
        <Center h={300}>
          <Loader />
        </Center>
      ) : (
        <Stack gap="lg">
          <Card>
            <Title order={4} mb="md">
              Spent vs. income by month
            </Title>
            <BarChart
              h={280}
              data={chartData}
              dataKey="month"
              withLegend
              legendProps={{ verticalAlign: 'top', height: 40 }}
              series={[
                { name: 'Spent', color: SERIES[0] },
                { name: 'Income', color: SERIES[1] },
              ]}
              valueFormatter={(v) => formatCents(Math.round(v * 100))}
              tickLine="none"
              gridAxis="x"
              barProps={{ radius: [4, 4, 0, 0] }}
              minBarSize={0}
            />
          </Card>

          <Card>
            <div className="table-scroll">
              <Table striped highlightOnHover miw={520}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Month</Table.Th>
                    <Table.Th ta="right">Spent</Table.Th>
                    <Table.Th ta="right">Income</Table.Th>
                    <Table.Th ta="right">Net</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.months.map((m) => {
                    const net = m.incomeCents - m.spentCents;
                    const empty = m.spentCents === 0 && m.incomeCents === 0;
                    return (
                      <Table.Tr key={m.month}>
                        <Table.Td>
                          <Anchor component={Link} to={linkTo(m.month)} size="sm">
                            {monthLabel(m.month)}
                          </Anchor>
                        </Table.Td>
                        <Table.Td ta="right" ff="monospace">
                          {formatCents(m.spentCents)}
                        </Table.Td>
                        <Table.Td ta="right" ff="monospace">
                          {formatCents(m.incomeCents)}
                        </Table.Td>
                        <Table.Td ta="right" ff="monospace" className={empty ? undefined : net >= 0 ? 'positive' : 'negative'}>
                          {net > 0 ? '+' : ''}
                          {formatCents(net)}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
                <Table.Tfoot>
                  <Table.Tr>
                    <Table.Th>Total</Table.Th>
                    <Table.Th ta="right" ff="monospace">
                      {formatCents(totals.spent)}
                    </Table.Th>
                    <Table.Th ta="right" ff="monospace">
                      {formatCents(totals.income)}
                    </Table.Th>
                    <Table.Th
                      ta="right"
                      ff="monospace"
                      className={totals.income - totals.spent >= 0 ? 'positive' : 'negative'}
                    >
                      {formatCents(totals.income - totals.spent)}
                    </Table.Th>
                  </Table.Tr>
                </Table.Tfoot>
              </Table>
            </div>
          </Card>
        </Stack>
      )}
    </>
  );
}
