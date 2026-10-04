import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  FileInput,
  Group,
  Modal,
  Radio,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle, IconFileSpreadsheet } from '@tabler/icons-react';
import { formatCents, type PrepareImportResult } from '@budget/shared';
import { api } from '../../lib/api';
import { applyMapping, guessMapping, readCsv, type CsvMapping, type CsvTable } from '../../lib/csv';
import { defaultFunding } from '../../lib/funding';
import { useLookups } from '../../lib/queries';
import { confirmDiscard, ImportReview, type PaymentRow, type ReviewRow } from './ImportReview';

/**
 * CSV import without the AI parser: the file is parsed in the browser and never uploaded.
 * The user confirms the column mapping, then reviews rows in the same table as statement import.
 */
export function CsvImportModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { data: lookups } = useLookups();
  const fullScreen = useMediaQuery('(max-width: 48em)');

  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [summary, setSummary] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setTable(null);
    setMapping(null);
    setRows(null);
    setPayments([]);
    setSummary(undefined);
    setError(null);
  };
  const finish = () => {
    reset();
    setCardId(null);
    onClose();
  };
  const close = () => (rows?.length || payments.length ? confirmDiscard(finish) : finish());

  const load = async (f: File | null) => {
    setFile(f);
    setError(null);
    setTable(null);
    setMapping(null);
    if (!f) return;
    try {
      const t = await readCsv(f);
      setTable(t);
      setMapping(guessMapping(t));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this CSV');
    }
  };

  const preview = useMemo(() => (table && mapping ? applyMapping(table, mapping) : null), [table, mapping]);
  const mappingComplete =
    !!mapping?.date &&
    !!mapping.description &&
    (mapping.amountMode === 'single' ? !!mapping.amount : !!mapping.debit && !!mapping.credit);

  const toReview = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const withKeys = preview.rows.map((r, i) => ({ ...r, key: `csv-${i}` }));
      const hints = await api.post<PrepareImportResult>('/api/import/prepare', {
        rows: withKeys.map(({ key, date, description, amountCents, kind }) => ({
          key,
          date,
          description,
          amountCents,
          isPayment: kind === 'payment',
        })),
      });
      setRows(
        withKeys
          .filter((r) => r.kind === 'purchase')
          .map((r) => {
            const hint = hints[r.key];
            const flag = hint?.possibleDuplicate ? 'Possible duplicate' : r.flag;
            return {
              key: r.key,
              include: !flag,
              date: r.date,
              description: r.description,
              amount: r.amountCents / 100,
              categoryId: hint?.categoryId ? String(hint.categoryId) : null,
              cardId,
              fundingAccountId: defaultFunding(lookups, cardId),
              note: '',
              flag,
            };
          }),
      );
      // A payment on a credit card's own export is to that card; on a bank export the user picks.
      const isCreditCard = lookups?.cards.some((c) => String(c.id) === cardId && c.accountId === null);
      setPayments(
        withKeys
          .filter((r) => r.kind === 'payment')
          .map((r) => ({
            key: r.key,
            include: !hints[r.key]?.possibleDuplicate,
            date: r.date,
            description: r.description,
            amount: r.amountCents / 100,
            cardId: isCreditCard ? cardId : null,
            fromAccountId: lookups?.paymentAccountId ? String(lookups.paymentAccountId) : null,
            flag: hints[r.key]?.possibleDuplicate ? 'Already recorded?' : null,
          })),
      );
      setSummary(preview.unreadable > 0 ? `${preview.unreadable} rows couldn't be read and were skipped` : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const columns = table?.headers ?? [];
  const set = (patch: Partial<CsvMapping>) => setMapping((m) => (m ? { ...m, ...patch } : m));

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={rows ? 'Review imported transactions' : 'Import CSV'}
      size={rows ? '95%' : 'xl'}
      fullScreen={fullScreen}
      closeOnClickOutside={!table}
    >
      {rows ? (
        <ImportReview
          rows={rows}
          setRows={setRows}
          payments={payments}
          setPayments={setPayments}
          summary={summary}
          onStartOver={reset}
          onSaved={finish}
        />
      ) : (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Export transactions as CSV from your bank's website. The file is read in your browser only and isn't
            uploaded or sent to the AI parser.
          </Text>
          <FileInput
            label="CSV file"
            placeholder="Choose a .csv file"
            accept=".csv,text/csv"
            leftSection={<IconFileSpreadsheet size={16} />}
            value={file}
            onChange={load}
            clearable
          />

          {error && (
            <Alert color="red" icon={<IconAlertTriangle size={18} />}>
              {error}
            </Alert>
          )}

          {table && mapping && (
            <>
              <Text fw={600} size="sm">
                Match the columns ({table.rows.length} rows detected)
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Select label="Date" data={columns} value={mapping.date} onChange={(v) => set({ date: v })} />
                <Select
                  label="Description"
                  data={columns}
                  value={mapping.description}
                  onChange={(v) => set({ description: v })}
                />
              </SimpleGrid>
              <SegmentedControl
                value={mapping.amountMode}
                onChange={(v) => set({ amountMode: v as CsvMapping['amountMode'] })}
                data={[
                  { value: 'single', label: 'One amount column' },
                  { value: 'split', label: 'Separate debit / credit columns' },
                ]}
              />
              {mapping.amountMode === 'single' ? (
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Select label="Amount" data={columns} value={mapping.amount} onChange={(v) => set({ amount: v })} />
                  <Radio.Group
                    label="In this file, purchases are"
                    value={mapping.purchasesAre}
                    onChange={(v) => set({ purchasesAre: v as CsvMapping['purchasesAre'] })}
                  >
                    <Group mt={8}>
                      <Radio value="positive" label="Positive (e.g. 25.00)" />
                      <Radio value="negative" label="Negative (e.g. -25.00)" />
                    </Group>
                  </Radio.Group>
                </SimpleGrid>
              ) : (
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Select
                    label="Debit (money out)"
                    data={columns}
                    value={mapping.debit}
                    onChange={(v) => set({ debit: v })}
                  />
                  <Select
                    label="Credit (money in)"
                    data={columns}
                    value={mapping.credit}
                    onChange={(v) => set({ credit: v })}
                  />
                </SimpleGrid>
              )}
              <Select
                label="Card / account for these transactions"
                description="Can be changed per row on the next step"
                placeholder="Select a card"
                data={(lookups?.cards ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
                value={cardId}
                onChange={setCardId}
                w={{ base: '100%', sm: 320 }}
              />

              {mappingComplete && preview && (
                <>
                  <Text fw={600} size="sm">
                    Preview{' '}
                    <Text span c="dimmed" size="sm" fw={400}>
                      (purchases should be positive, refunds negative)
                    </Text>
                  </Text>
                  <div className="table-scroll">
                    <Table striped verticalSpacing={4} miw={480}>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Date</Table.Th>
                          <Table.Th>Description</Table.Th>
                          <Table.Th ta="right">Amount</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {preview.rows.slice(0, 5).map((r, i) => (
                          <Table.Tr key={i}>
                            <Table.Td ff="monospace">{r.date}</Table.Td>
                            <Table.Td>
                              <Text size="sm" lineClamp={1}>
                                {r.description}
                              </Text>
                            </Table.Td>
                            <Table.Td ta="right" ff="monospace">
                              {formatCents(r.amountCents)}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </div>
                  {preview.unreadable > 0 && (
                    <Text size="sm" c="orange">
                      {preview.unreadable} rows have an unreadable date or amount and will be skipped. Check the column
                      choices above.
                    </Text>
                  )}
                </>
              )}
            </>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button onClick={toReview} loading={busy} disabled={!mappingComplete || !preview?.rows.length}>
              Continue to review
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
