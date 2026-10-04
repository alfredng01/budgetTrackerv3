import { useMemo, type Dispatch, type SetStateAction } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconTrash } from '@tabler/icons-react';
import { formatCents, toCents } from '@budget/shared';
import { defaultFunding, fundingChoices } from '../../lib/funding';
import { useImportCommit, useLookups } from '../../lib/queries';

export interface ReviewRow {
  key: string;
  include: boolean;
  date: string;
  description: string;
  amount: number | string;
  categoryId: string | null;
  cardId: string | null;
  /** Only used for cards linked to an account (e.g. Venmo balance vs Checking). */
  fundingAccountId: string | null;
  note: string;
  /** Why the row starts unchecked (likely duplicate, looks like a transfer). */
  flag: string | null;
}

export interface PaymentRow {
  key: string;
  include: boolean;
  date: string;
  description: string;
  amount: number | string;
  cardId: string | null;
  fromAccountId: string | null;
  flag: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function rowErrors(r: ReviewRow) {
  return {
    date: !DATE_RE.test(r.date),
    description: !r.description.trim(),
    amount: r.amount === '' || Number(r.amount) === 0,
    categoryId: !r.categoryId,
    cardId: !r.cardId,
  };
}
function paymentErrors(p: PaymentRow) {
  return {
    date: !DATE_RE.test(p.date),
    amount: p.amount === '' || Number(p.amount) <= 0,
    cardId: !p.cardId,
    fromAccountId: !p.fromAccountId,
  };
}
const hasError = (errs: Record<string, boolean>) => Object.values(errs).some(Boolean);

/** Asks before throwing away rows that were parsed but not saved. */
export function confirmDiscard(onConfirm: () => void) {
  modals.openConfirmModal({
    title: 'Discard this import?',
    children: <Text size="sm">The parsed rows haven't been saved. Closing will discard them.</Text>,
    labels: { confirm: 'Discard', cancel: 'Keep reviewing' },
    confirmProps: { color: 'red' },
    onConfirm,
  });
}

interface Props {
  rows: ReviewRow[];
  setRows: Dispatch<SetStateAction<ReviewRow[] | null>>;
  payments: PaymentRow[];
  setPayments: Dispatch<SetStateAction<PaymentRow[]>>;
  /** Shown next to the row count, e.g. "1 transfer skipped". */
  summary?: string;
  onStartOver: () => void;
  onSaved: () => void;
}

/** Editable review tables (purchases + card payments) shared by the statement (AI) and CSV imports. */
export function ImportReview({ rows, setRows, payments, setPayments, summary, onStartOver, onSaved }: Props) {
  const { data: lookups } = useLookups();
  const commit = useImportCommit();

  const categoryOptions = useMemo(() => (lookups?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name })), [lookups]);
  const cardOptions = useMemo(() => (lookups?.cards ?? []).map((c) => ({ value: String(c.id), label: c.name })), [lookups]);
  const creditCardOptions = useMemo(
    () => (lookups?.cards ?? []).filter((c) => c.accountId === null).map((c) => ({ value: String(c.id), label: c.name })),
    [lookups],
  );
  const accountOptions = useMemo(() => (lookups?.accounts ?? []).map((a) => ({ value: String(a.id), label: a.name })), [lookups]);
  const paymentAccountName = lookups?.accounts.find((a) => a.id === lookups.paymentAccountId)?.name ?? 'your payment account';

  const update = (key: string, patch: Partial<ReviewRow>) =>
    setRows((prev) => prev?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);
  const updateAll = (patch: Partial<ReviewRow>) => setRows((prev) => prev?.map((r) => ({ ...r, ...patch })) ?? null);
  const updatePayment = (key: string, patch: Partial<PaymentRow>) =>
    setPayments((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const included = rows.filter((r) => r.include);
  const includedPayments = payments.filter((p) => p.include);
  const invalidCount =
    included.filter((r) => hasError(rowErrors(r))).length + includedPayments.filter((p) => hasError(paymentErrors(p))).length;
  const totalCents = included.reduce((s, r) => s + (r.amount === '' ? 0 : toCents(r.amount)), 0);
  const allChecked = rows.length > 0 && included.length === rows.length;
  const flaggedCount = rows.filter((r) => r.flag).length + payments.filter((p) => p.flag).length;
  const saveCount = included.length + includedPayments.length;

  const save = () => {
    commit.mutate(
      {
        transactions: included.map((r) => ({
          date: r.date,
          description: r.description.trim(),
          note: r.note.trim(),
          amountCents: toCents(r.amount),
          categoryId: Number(r.categoryId),
          cardId: Number(r.cardId),
          fundingAccountId: r.fundingAccountId ? Number(r.fundingAccountId) : null,
        })),
        payments: includedPayments.map((p) => ({
          date: p.date,
          description: p.description.trim(),
          amountCents: toCents(p.amount),
          cardId: Number(p.cardId),
          fromAccountId: Number(p.fromAccountId),
        })),
      },
      {
        onSuccess: (res) => {
          const parts = [`${res.transactions} transactions`];
          if (res.payments) parts.push(`${res.payments} card payments`);
          notifications.show({ color: 'teal', message: `Saved ${parts.join(' and ')}` });
          onSaved();
        },
      },
    );
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select
            label="Card for all rows"
            placeholder="Select a card"
            data={cardOptions}
            searchable
            selectFirstOptionOnChange
            w={240}
            onChange={(v) => v && updateAll({ cardId: v, fundingAccountId: defaultFunding(lookups, v) })}
          />
          <Select
            label="Category for checked rows"
            placeholder="Optional"
            data={categoryOptions}
            searchable
            selectFirstOptionOnChange
            w={220}
            onChange={(v) =>
              v && setRows((prev) => prev?.map((r) => (r.include ? { ...r, categoryId: v } : r)) ?? null)
            }
          />
        </Group>
        <Text size="sm" c="dimmed">
          {rows.length} transactions found
          {payments.length > 0 && ` · ${payments.length} card payments`}
          {summary && ` · ${summary}`}
        </Text>
      </Group>

      {flaggedCount > 0 && (
        <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
          {flaggedCount} flagged row{flaggedCount === 1 ? ' is' : 's are'} unchecked: they look like a duplicate of
          something you already saved, or a transfer. Check them if they should be saved.
        </Alert>
      )}

      <div className="table-scroll">
        <Table striped highlightOnHover verticalSpacing={6} miw={1300}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={36}>
                <Checkbox
                  aria-label="Include all"
                  checked={allChecked}
                  indeterminate={included.length > 0 && !allChecked}
                  onChange={(e) => updateAll({ include: e.currentTarget.checked })}
                />
              </Table.Th>
              <Table.Th w={150}>Date</Table.Th>
              <Table.Th miw={240}>Description</Table.Th>
              <Table.Th w={130}>Amount</Table.Th>
              <Table.Th w={170}>Category</Table.Th>
              <Table.Th w={200}>Card</Table.Th>
              <Table.Th w={160}>Paid from</Table.Th>
              <Table.Th w={180}>Note</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => {
              const err = r.include ? rowErrors(r) : null;
              const funding = fundingChoices(lookups, r.cardId);
              return (
                <Table.Tr key={r.key} opacity={r.include ? 1 : 0.5}>
                  <Table.Td>
                    <Checkbox
                      aria-label="Include row"
                      checked={r.include}
                      onChange={(e) => update(r.key, { include: e.currentTarget.checked })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      type="date"
                      value={r.date}
                      error={err?.date}
                      onChange={(e) => update(r.key, { date: e.currentTarget.value })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={2}>
                      <TextInput
                        size="xs"
                        value={r.description}
                        error={err?.description}
                        onChange={(e) => update(r.key, { description: e.currentTarget.value })}
                      />
                      {r.flag && (
                        <Badge size="xs" color="yellow" variant="light" leftSection={<IconAlertTriangle size={10} />}>
                          {r.flag}
                        </Badge>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      prefix="$"
                      decimalScale={2}
                      thousandSeparator=","
                      value={r.amount}
                      error={err?.amount}
                      onChange={(v) => update(r.key, { amount: v })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      data={categoryOptions}
                      value={r.categoryId}
                      placeholder="Category"
                      searchable
                      selectFirstOptionOnChange
                      error={err?.categoryId}
                      onChange={(v) => update(r.key, { categoryId: v })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      data={cardOptions}
                      value={r.cardId}
                      placeholder="Card"
                      searchable
                      selectFirstOptionOnChange
                      error={err?.cardId}
                      onChange={(v) => update(r.key, { cardId: v, fundingAccountId: defaultFunding(lookups, v) })}
                    />
                  </Table.Td>
                  <Table.Td>
                    {funding.length > 1 ? (
                      <Select
                        size="xs"
                        data={funding}
                        value={r.fundingAccountId ?? funding[0].value}
                        allowDeselect={false}
                        onChange={(v) => update(r.key, { fundingAccountId: v })}
                      />
                    ) : (
                      <Text size="xs" c="dimmed">
                        {funding[0]?.label ?? 'Paid with card'}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      placeholder="Optional"
                      maxLength={500}
                      value={r.note}
                      onChange={(e) => update(r.key, { note: e.currentTarget.value })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label="Remove row">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Remove row"
                        onClick={() => setRows((prev) => prev?.filter((x) => x.key !== r.key) ?? null)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </div>

      {payments.length > 0 && (
        <Stack gap="xs">
          <div>
            <Title order={5}>Credit card payments</Title>
            <Text size="sm" c="dimmed">
              Not counted as spending. Saved payments come out of the chosen account (usually {paymentAccountName}) and
              update the card's last paid date.
            </Text>
          </div>
          <div className="table-scroll">
            <Table striped verticalSpacing={6} miw={900}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={36} />
                  <Table.Th w={150}>Date</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th w={130}>Amount</Table.Th>
                  <Table.Th w={220}>Card paid</Table.Th>
                  <Table.Th w={190}>Paid from</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {payments.map((p) => {
                  const err = p.include ? paymentErrors(p) : null;
                  return (
                    <Table.Tr key={p.key} opacity={p.include ? 1 : 0.5}>
                      <Table.Td>
                        <Checkbox
                          aria-label="Include payment"
                          checked={p.include}
                          onChange={(e) => updatePayment(p.key, { include: e.currentTarget.checked })}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          size="xs"
                          type="date"
                          value={p.date}
                          error={err?.date}
                          onChange={(e) => updatePayment(p.key, { date: e.currentTarget.value })}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size="sm">{p.description}</Text>
                          {p.flag && (
                            <Badge size="xs" color="yellow" variant="light" leftSection={<IconAlertTriangle size={10} />}>
                              {p.flag}
                            </Badge>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          size="xs"
                          prefix="$"
                          decimalScale={2}
                          thousandSeparator=","
                          min={0}
                          value={p.amount}
                          error={err?.amount}
                          onChange={(v) => updatePayment(p.key, { amount: v })}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          data={creditCardOptions}
                          value={p.cardId}
                          placeholder="Which card?"
                          searchable
                          selectFirstOptionOnChange
                          error={err?.cardId}
                          onChange={(v) => updatePayment(p.key, { cardId: v })}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          data={accountOptions}
                          value={p.fromAccountId}
                          allowDeselect={false}
                          error={err?.fromAccountId}
                          onChange={(v) => updatePayment(p.key, { fromAccountId: v })}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label="Remove payment">
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Remove payment"
                            onClick={() => setPayments((prev) => prev.filter((x) => x.key !== p.key))}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </div>
        </Stack>
      )}

      <Group justify="space-between" wrap="wrap">
        <Text size="sm">
          {included.length} transactions selected · total <b>{formatCents(totalCents)}</b>
          {includedPayments.length > 0 && ` · ${includedPayments.length} payments`}
          {invalidCount > 0 && (
            <Text span c="red" size="sm">
              {' '}
              · {invalidCount} need a category, card or fix
            </Text>
          )}
        </Text>
        <Group>
          <Button variant="default" onClick={onStartOver}>
            Start over
          </Button>
          <Button onClick={save} loading={commit.isPending} disabled={saveCount === 0 || invalidCount > 0}>
            Save {saveCount} {saveCount === 1 ? 'row' : 'rows'}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
