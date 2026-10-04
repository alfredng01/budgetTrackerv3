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
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { formatCents, toCents } from '@budget/shared';
import { UserFilter } from '../components/ViewFilters';
import { useDeletePayment, useLookups, useMe, usePayments, useSavePayment } from '../lib/queries';
import { todayIso, useViewParams } from '../lib/view';

function daysSince(date: string): number {
  return Math.floor((Date.parse(`${todayIso()}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}

/** "today", "3 days ago", or "in 2 days" for scheduled payments. */
function relativeDays(days: number): string {
  if (days === 0) return 'today';
  const n = Math.abs(days);
  const unit = `${n} day${n === 1 ? '' : 's'}`;
  return days > 0 ? `${unit} ago` : `in ${unit}`;
}

function RecordPaymentModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { data: lookups } = useLookups();
  const save = useSavePayment();
  const [cardId, setCardId] = useState<string | null>(null);
  const [fromAccountId, setFromAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | string>('');
  const [date, setDate] = useState(todayIso());
  useEffect(() => {
    if (opened) {
      setCardId(null);
      setFromAccountId(lookups?.paymentAccountId ? String(lookups.paymentAccountId) : null);
      setAmount('');
      setDate(todayIso());
    }
  }, [opened, lookups]);

  const valid = cardId && fromAccountId && amount !== '' && Number(amount) > 0 && date;
  return (
    <Modal opened={opened} onClose={onClose} title="Record card payment">
      <Stack gap="sm">
        <Select
          label="Card"
          data={(lookups?.cards ?? []).filter((c) => c.accountId === null).map((c) => ({ value: String(c.id), label: c.name }))}
          value={cardId}
          onChange={setCardId}
          searchable
          selectFirstOptionOnChange
        />
        <NumberInput label="Amount" prefix="$" decimalScale={2} thousandSeparator="," min={0} value={amount} onChange={setAmount} />
        <TextInput type="date" label="Date paid" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
        <Select
          label="Paid from"
          data={(lookups?.accounts ?? []).map((a) => ({ value: String(a.id), label: a.name }))}
          value={fromAccountId}
          onChange={setFromAccountId}
          allowDeselect={false}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            disabled={!valid}
            onClick={() =>
              save.mutate(
                { cardId: Number(cardId), fromAccountId: Number(fromAccountId), amountCents: toCents(amount), date },
                { onSuccess: onClose },
              )
            }
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function CreditCardsPage() {
  const { data: me } = useMe();
  const { userId } = useViewParams();
  const { data, isLoading } = usePayments(userId);
  const del = useDeletePayment();
  const isAdmin = me?.role === 'admin';
  const [recording, setRecording] = useState(false);

  return (
    <>
      <Group justify="space-between" mb="lg" gap="sm">
        <Title order={2}>Credit cards</Title>
        <Group gap="xs">
          <UserFilter />
          {!isAdmin && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setRecording(true)}>
              Record payment
            </Button>
          )}
        </Group>
      </Group>

      {isLoading || !data ? (
        <Center h={200}>
          <Loader />
        </Center>
      ) : (
        <Stack gap="lg">
          <Card>
            <Title order={4} mb={4}>
              Last paid
            </Title>
            <Text size="sm" c="dimmed" mb="md">
              Updated automatically when an imported statement contains a card payment.
            </Text>
            <div className="table-scroll">
              <Table striped miw={520}>
                <Table.Thead>
                  <Table.Tr>
                    {isAdmin && <Table.Th>User</Table.Th>}
                    <Table.Th>Card</Table.Th>
                    <Table.Th>Last paid</Table.Th>
                    <Table.Th ta="right">Amount</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.lastPaid.map((c) => {
                    const days = c.lastPaidDate ? daysSince(c.lastPaidDate) : null;
                    return (
                      <Table.Tr key={`${c.userId}-${c.cardId}`}>
                        {isAdmin && <Table.Td>{c.username}</Table.Td>}
                        <Table.Td fw={500}>{c.cardName}</Table.Td>
                        <Table.Td>
                          {c.lastPaidDate ? (
                            <Group gap="xs">
                              <Text size="sm" ff="monospace">
                                {c.lastPaidDate}
                              </Text>
                              <Badge size="sm" variant="light" color={days !== null && days > 31 ? 'orange' : 'gray'}>
                                {relativeDays(days!)}
                              </Badge>
                            </Group>
                          ) : (
                            <Text size="sm" c="dimmed">
                              No payment recorded
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td ta="right" ff="monospace">
                          {c.lastAmountCents !== null ? formatCents(c.lastAmountCents) : '—'}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </div>
          </Card>

          <Card>
            <Title order={4} mb="md">
              Payment history
            </Title>
            {data.recent.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No payments recorded yet.
              </Text>
            ) : (
              <div className="table-scroll">
                <Table striped miw={620}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Date</Table.Th>
                      {isAdmin && <Table.Th>User</Table.Th>}
                      <Table.Th>Card</Table.Th>
                      <Table.Th>Paid from</Table.Th>
                      <Table.Th ta="right">Amount</Table.Th>
                      {!isAdmin && <Table.Th w={40} />}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.recent.map((p) => (
                      <Table.Tr key={p.id}>
                        <Table.Td ff="monospace">{p.date}</Table.Td>
                        {isAdmin && <Table.Td>{p.username}</Table.Td>}
                        <Table.Td>
                          <Text size="sm">{p.cardName}</Text>
                          {p.description && (
                            <Text size="xs" c="dimmed">
                              {p.description}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>{p.fromAccountName ?? '—'}</Table.Td>
                        <Table.Td ta="right" ff="monospace">
                          {formatCents(p.amountCents)}
                        </Table.Td>
                        {!isAdmin && (
                          <Table.Td>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              aria-label="Delete payment"
                              onClick={() =>
                                modals.openConfirmModal({
                                  title: 'Delete payment?',
                                  children: (
                                    <Text size="sm">
                                      {p.cardName} · {formatCents(p.amountCents)} on {p.date}
                                    </Text>
                                  ),
                                  labels: { confirm: 'Delete', cancel: 'Cancel' },
                                  confirmProps: { color: 'red' },
                                  onConfirm: () => del.mutate(p.id),
                                })
                              }
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Table.Td>
                        )}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            )}
          </Card>
        </Stack>
      )}

      <RecordPaymentModal opened={recording} onClose={() => setRecording(false)} />
    </>
  );
}
