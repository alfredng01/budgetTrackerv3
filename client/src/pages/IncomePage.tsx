import { useState } from 'react';
import { ActionIcon, Button, Card, Center, Group, Loader, Table, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { formatCents, type Income } from '@budget/shared';
import { IncomeModal } from '../components/IncomeModal';
import { ViewFilters } from '../components/ViewFilters';
import { useDeleteIncome, useIncome, useMe } from '../lib/queries';
import { useViewParams } from '../lib/view';

export function IncomePage() {
  const { data: me } = useMe();
  const { month, userId } = useViewParams();
  const { data: rows, isLoading } = useIncome(month, userId);
  const del = useDeleteIncome();
  const isAdmin = me?.role === 'admin';
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const total = (rows ?? []).reduce((s, r) => s + r.amountCents, 0);

  const confirmDelete = (i: Income) =>
    modals.openConfirmModal({
      title: 'Delete income entry?',
      children: (
        <Text size="sm">
          {i.source} · {formatCents(i.amountCents)} on {i.date}
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => del.mutate(i.id),
    });

  return (
    <>
      <ViewFilters
        title="Income"
        actions={
          !isAdmin && (
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => {
                setEditing(null);
                setOpened(true);
              }}
            >
              Add income
            </Button>
          )
        }
      />
      <Card>
        <Text size="sm" c="dimmed" mb="md">
          Total this month: <b>{formatCents(total)}</b>
        </Text>
        {isLoading ? (
          <Center h={160}>
            <Loader />
          </Center>
        ) : !rows?.length ? (
          <Center h={120}>
            <Text c="dimmed">No income recorded for this month.</Text>
          </Center>
        ) : (
          <div className="table-scroll">
            <Table striped miw={580}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  {isAdmin && <Table.Th>Added by</Table.Th>}
                  <Table.Th>Source</Table.Th>
                  <Table.Th>Account</Table.Th>
                  <Table.Th ta="right">Amount</Table.Th>
                  {!isAdmin && <Table.Th w={80} />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((i) => (
                  <Table.Tr key={i.id}>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {i.date}
                      </Text>
                    </Table.Td>
                    {isAdmin && <Table.Td>{i.username}</Table.Td>}
                    <Table.Td>{i.source}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c={i.accountName ? undefined : 'dimmed'}>
                        {i.accountName ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace">
                        {formatCents(i.amountCents)}
                      </Text>
                    </Table.Td>
                    {!isAdmin && (
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          <ActionIcon
                            variant="subtle"
                            aria-label="Edit"
                            onClick={() => {
                              setEditing(i);
                              setOpened(true);
                            }}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon variant="subtle" color="red" aria-label="Delete" onClick={() => confirmDelete(i)}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        )}
      </Card>
      <IncomeModal opened={opened} onClose={() => setOpened(false)} editing={editing} />
    </>
  );
}
