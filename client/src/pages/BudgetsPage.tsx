import { useEffect, useState } from 'react';
import { Button, Card, Center, Group, Loader, NumberInput, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { formatCents, toCents, type BudgetRow } from '@budget/shared';
import { ViewFilters } from '../components/ViewFilters';
import { useBudgets, useMe, useSaveBudget } from '../lib/queries';
import { useViewParams } from '../lib/view';

function BudgetEditor({ row }: { row: BudgetRow }) {
  const save = useSaveBudget();
  const initial = row.limitCents === null ? '' : row.limitCents / 100;
  const [value, setValue] = useState<number | string>(initial);
  useEffect(() => setValue(initial), [initial]);

  const dirty = String(value) !== String(initial);
  const commit = () => {
    const limitCents = value === '' ? null : toCents(value);
    save.mutate(
      { categoryId: row.categoryId, limitCents },
      {
        onSuccess: () =>
          notifications.show({
            color: 'teal',
            message: limitCents ? `${row.categoryName} limit set to ${formatCents(limitCents)}` : `${row.categoryName} limit removed`,
          }),
      },
    );
  };

  return (
    <Group gap="xs" wrap="nowrap">
      <NumberInput
        aria-label={`${row.categoryName} monthly limit`}
        placeholder="No limit"
        prefix="$"
        decimalScale={2}
        thousandSeparator=","
        min={0}
        w={160}
        value={value}
        onChange={setValue}
        onKeyDown={(e) => e.key === 'Enter' && dirty && commit()}
      />
      <Button size="xs" variant={dirty ? 'filled' : 'subtle'} disabled={!dirty} loading={save.isPending} onClick={commit}>
        Save
      </Button>
    </Group>
  );
}

export function BudgetsPage() {
  const { data: me } = useMe();
  const { userId } = useViewParams();
  const { data: rows, isLoading } = useBudgets(userId);
  const isAdmin = me?.role === 'admin';

  return (
    <>
      <ViewFilters title="Budgets" hideMonth />
      <Card maw={640}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {isAdmin
              ? 'Monthly limits per category. With "All users" selected, limits are summed across users.'
              : 'Monthly spending limit per category. These apply to every month until you change them; leave blank for no limit.'}
          </Text>
          {isLoading ? (
            <Center h={160}>
              <Loader />
            </Center>
          ) : (
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>Monthly limit</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows?.map((r) => (
                  <Table.Tr key={r.categoryId}>
                    <Table.Td>{r.categoryName}</Table.Td>
                    <Table.Td>
                      {isAdmin ? (
                        <Text size="sm" ff="monospace" c={r.limitCents ? undefined : 'dimmed'}>
                          {r.limitCents ? formatCents(r.limitCents) : 'No limit'}
                        </Text>
                      ) : (
                        <BudgetEditor row={r} />
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      </Card>
    </>
  );
}
