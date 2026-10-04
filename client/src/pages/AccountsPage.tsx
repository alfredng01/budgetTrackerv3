import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconArrowsExchange, IconArrowBackUp, IconPencil } from '@tabler/icons-react';
import { formatCents, toCents, type AccountActivity, type AccountBalance } from '@budget/shared';
import { UserFilter } from '../components/ViewFilters';
import { useAccountActivity, useAccounts, useDeleteAccountEntry, useLookups, useMe, useSetBalance, useTransfer } from '../lib/queries';
import { todayIso, useViewParams } from '../lib/view';

const KIND_LABEL: Record<AccountActivity['kind'], string> = {
  income: 'Income',
  purchase: 'Purchase',
  'card-payment': 'Card payment',
  adjustment: 'Adjustment',
  transfer: 'Transfer',
};

function SetBalanceModal({ account, onClose }: { account: AccountBalance | null; onClose: () => void }) {
  const setBalance = useSetBalance();
  const [amount, setAmount] = useState<number | string>('');
  const [date, setDate] = useState(todayIso());
  useEffect(() => {
    if (account) {
      setAmount(account.balanceCents / 100);
      setDate(todayIso());
    }
  }, [account]);

  return (
    <Modal opened={!!account} onClose={onClose} title={`Set ${account?.accountName ?? ''} balance`}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Enter the balance your bank shows. The difference from the tracked balance (
          {formatCents(account?.balanceCents ?? 0)}) is recorded as an adjustment.
        </Text>
        <NumberInput label="Actual balance" prefix="$" decimalScale={2} thousandSeparator="," value={amount} onChange={setAmount} />
        <TextInput type="date" label="As of" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={setBalance.isPending}
            disabled={amount === '' || !date}
            onClick={() =>
              account &&
              setBalance.mutate({ accountId: account.accountId, date, balanceCents: toCents(amount) }, { onSuccess: onClose })
            }
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function TransferModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { data: lookups } = useLookups();
  const transfer = useTransfer();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | string>('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  useEffect(() => {
    if (opened) {
      setFrom(lookups?.paymentAccountId ? String(lookups.paymentAccountId) : null);
      setTo(null);
      setAmount('');
      setDate(todayIso());
      setNote('');
    }
  }, [opened, lookups]);

  const options = (lookups?.accounts ?? []).map((a) => ({ value: String(a.id), label: a.name }));
  const valid = from && to && from !== to && amount !== '' && Number(amount) > 0 && date;

  return (
    <Modal opened={opened} onClose={onClose} title="Transfer between accounts">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Moves money between your own accounts. It isn't counted as spending or income.
        </Text>
        <SimpleGrid cols={2}>
          <Select label="From" data={options} value={from} onChange={setFrom} allowDeselect={false} />
          <Select
            label="To"
            data={options}
            value={to}
            onChange={setTo}
            allowDeselect={false}
            error={from && to === from ? 'Pick a different account' : undefined}
          />
        </SimpleGrid>
        <NumberInput label="Amount" prefix="$" decimalScale={2} thousandSeparator="," min={0} value={amount} onChange={setAmount} />
        <TextInput type="date" label="Date" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
        <TextInput label="Note" placeholder="Optional" maxLength={200} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={transfer.isPending}
            disabled={!valid}
            onClick={() =>
              transfer.mutate(
                { fromAccountId: Number(from), toAccountId: Number(to), amountCents: toCents(amount), date, note },
                { onSuccess: onClose },
              )
            }
          >
            Transfer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ActivityTable({ accountId, userId, canEdit }: { accountId: number; userId: string | null; canEdit: boolean }) {
  const { data, isLoading } = useAccountActivity(accountId, userId);
  const del = useDeleteAccountEntry();

  if (isLoading) {
    return (
      <Center h={120}>
        <Loader size="sm" />
      </Center>
    );
  }
  if (!data?.length) {
    return (
      <Text c="dimmed" size="sm" ta="center" py="lg">
        No activity yet. Set a starting balance to begin tracking.
      </Text>
    );
  }
  return (
    <div className="table-scroll">
      <Table striped miw={560}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date</Table.Th>
            <Table.Th>Description</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th ta="right">Amount</Table.Th>
            {canEdit && <Table.Th w={40} />}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.map((a) => (
            <Table.Tr key={a.key}>
              <Table.Td ff="monospace">{a.date}</Table.Td>
              <Table.Td>{a.description}</Table.Td>
              <Table.Td>
                <Badge variant="light" color="gray" size="sm">
                  {KIND_LABEL[a.kind]}
                </Badge>
              </Table.Td>
              <Table.Td ta="right" ff="monospace" className={a.amountCents >= 0 ? 'positive' : undefined}>
                {a.amountCents > 0 ? '+' : ''}
                {formatCents(a.amountCents)}
              </Table.Td>
              {canEdit && (
                <Table.Td>
                  {a.entryId && (
                    <Tooltip label={a.kind === 'transfer' ? 'Undo transfer (both sides)' : 'Undo adjustment'}>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Undo"
                        onClick={() =>
                          modals.openConfirmModal({
                            title: a.kind === 'transfer' ? 'Undo this transfer?' : 'Undo this adjustment?',
                            children: (
                              <Text size="sm">
                                {a.description} · {formatCents(a.amountCents)}
                              </Text>
                            ),
                            labels: { confirm: 'Undo', cancel: 'Cancel' },
                            confirmProps: { color: 'red' },
                            onConfirm: () => del.mutate(a.entryId!),
                          })
                        }
                      >
                        <IconArrowBackUp size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}

export function AccountsPage() {
  const { data: me } = useMe();
  const { userId } = useViewParams();
  const { data: balances, isLoading } = useAccounts(userId);
  const isAdmin = me?.role === 'admin';
  const [selected, setSelected] = useState<{ userId: string; accountId: number } | null>(null);
  const [settingBalance, setSettingBalance] = useState<AccountBalance | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const byUser = new Map<string, AccountBalance[]>();
  for (const b of balances ?? []) byUser.set(b.userId, [...(byUser.get(b.userId) ?? []), b]);
  const selectedRow = balances?.find((b) => b.userId === selected?.userId && b.accountId === selected?.accountId);

  return (
    <>
      <Group justify="space-between" mb="lg" gap="sm">
        <Title order={2}>Accounts</Title>
        <Group gap="xs">
          <UserFilter />
          {!isAdmin && (
            <Button leftSection={<IconArrowsExchange size={16} />} onClick={() => setTransferOpen(true)}>
              Transfer
            </Button>
          )}
        </Group>
      </Group>

      {isLoading ? (
        <Center h={200}>
          <Loader />
        </Center>
      ) : (
        <Stack gap="xl">
          {[...byUser.entries()].map(([uid, rows]) => (
            <Stack key={uid} gap="sm">
              {isAdmin && <Title order={4}>{rows[0].username}</Title>}
              <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
                {rows.map((b) => {
                  const active = selected?.userId === b.userId && selected.accountId === b.accountId;
                  return (
                    <Card key={b.accountId} padding="md" style={active ? { borderColor: 'var(--mantine-color-blue-filled)' } : undefined}>
                      <UnstyledButton onClick={() => setSelected({ userId: b.userId, accountId: b.accountId })}>
                        <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                          {b.accountName}
                        </Text>
                        <Text fz={26} fw={700} className={b.balanceCents < 0 ? 'negative' : undefined}>
                          {formatCents(b.balanceCents)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          View activity
                        </Text>
                      </UnstyledButton>
                      {!isAdmin && (
                        <Tooltip label="Set balance to match your bank">
                          <ActionIcon
                            variant="subtle"
                            pos="absolute"
                            top={10}
                            right={10}
                            aria-label={`Set ${b.accountName} balance`}
                            onClick={() => setSettingBalance(b)}
                          >
                            <IconPencil size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Card>
                  );
                })}
              </SimpleGrid>
            </Stack>
          ))}

          {selectedRow && (
            <Card>
              <Title order={4} mb="sm">
                {selectedRow.accountName} activity{isAdmin ? ` · ${selectedRow.username}` : ''}
              </Title>
              <ActivityTable accountId={selectedRow.accountId} userId={isAdmin ? selectedRow.userId : null} canEdit={!isAdmin} />
            </Card>
          )}
        </Stack>
      )}

      <SetBalanceModal account={settingBalance} onClose={() => setSettingBalance(null)} />
      <TransferModal opened={transferOpen} onClose={() => setTransferOpen(false)} />
    </>
  );
}
