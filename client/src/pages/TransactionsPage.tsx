import { useMemo, useState } from 'react';
import { ActionIcon, Badge, Button, Card, Center, Group, Loader, Select, Table, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconEdit, IconFileSpreadsheet, IconFileUpload, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { formatCents, type Transaction } from '@budget/shared';
import { CsvImportModal } from '../components/import/CsvImportModal';
import { ImportStatementModal } from '../components/import/ImportStatementModal';
import { TransactionModal } from '../components/TransactionModal';
import { ViewFilters } from '../components/ViewFilters';
import { useDeleteTransaction, useLookups, useMe, useTransactions } from '../lib/queries';
import { useViewParams } from '../lib/view';

export function TransactionsPage() {
  const { data: me } = useMe();
  const { data: lookups } = useLookups();
  const { month, userId } = useViewParams();
  const { data: rows, isLoading } = useTransactions(month, userId);
  const del = useDeleteTransaction();
  const isAdmin = me?.role === 'admin';

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [modal, setModal] = useState<'txn' | 'import' | 'csv' | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (!category || String(r.categoryId) === category) &&
        (!q || r.description.toLowerCase().includes(q) || r.note.toLowerCase().includes(q)),
    );
  }, [rows, search, category]);
  const total = filtered.reduce((s, r) => s + r.amountCents, 0);

  const confirmDelete = (t: Transaction) =>
    modals.openConfirmModal({
      title: 'Delete transaction?',
      children: (
        <Text size="sm">
          {t.description} · {formatCents(t.amountCents)} on {t.date}
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => del.mutate(t.id),
    });

  return (
    <>
      <ViewFilters
        title="Transactions"
        actions={
          !isAdmin && (
            <>
              <Button leftSection={<IconFileUpload size={16} />} onClick={() => setModal('import')}>
                Import statement
              </Button>
              <Button variant="default" leftSection={<IconFileSpreadsheet size={16} />} onClick={() => setModal('csv')}>
                Import CSV
              </Button>
              <Button
                variant="default"
                leftSection={<IconPlus size={16} />}
                onClick={() => {
                  setEditing(null);
                  setModal('txn');
                }}
              >
                Add
              </Button>
            </>
          )
        }
      />

      <Card>
        <Group mb="md" gap="sm">
          <TextInput
            placeholder="Search description or note"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={260}
          />
          <Select
            placeholder="All categories"
            data={(lookups?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
            value={category}
            onChange={setCategory}
            clearable
            w={200}
          />
          <Text size="sm" c="dimmed" ml="auto">
            {filtered.length} transactions · {formatCents(total)}
          </Text>
        </Group>

        {isLoading ? (
          <Center h={200}>
            <Loader />
          </Center>
        ) : filtered.length === 0 ? (
          <Center h={160}>
            <Text c="dimmed">No transactions for this month.</Text>
          </Center>
        ) : (
          <div className="table-scroll">
            <Table striped highlightOnHover miw={isAdmin ? 820 : 760}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  {isAdmin && <Table.Th>Added by</Table.Th>}
                  <Table.Th>Description</Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>Card</Table.Th>
                  <Table.Th ta="right">Amount</Table.Th>
                  {!isAdmin && <Table.Th w={80} />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((t) => (
                  <Table.Tr key={t.id}>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {t.date}
                      </Text>
                    </Table.Td>
                    {isAdmin && <Table.Td>{t.username}</Table.Td>}
                    <Table.Td>
                      <Text size="sm">{t.description}</Text>
                      {t.note && (
                        <Text size="xs" c="dimmed">
                          {t.note}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color="gray">
                        {t.categoryName}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{t.cardName}</Text>
                      {t.fundingAccountName && t.fundingAccountName !== t.cardName && (
                        <Text size="xs" c="dimmed">
                          from {t.fundingAccountName}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" ff="monospace" className={t.amountCents < 0 ? 'positive' : undefined}>
                        {formatCents(t.amountCents)}
                      </Text>
                    </Table.Td>
                    {!isAdmin && (
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          <ActionIcon
                            variant="subtle"
                            aria-label="Edit"
                            onClick={() => {
                              setEditing(t);
                              setModal('txn');
                            }}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon variant="subtle" color="red" aria-label="Delete" onClick={() => confirmDelete(t)}>
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

      <TransactionModal opened={modal === 'txn'} onClose={() => setModal(null)} editing={editing} />
      <ImportStatementModal opened={modal === 'import'} onClose={() => setModal(null)} />
      <CsvImportModal opened={modal === 'csv'} onClose={() => setModal(null)} />
    </>
  );
}
