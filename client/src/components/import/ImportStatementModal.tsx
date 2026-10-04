import { useState } from 'react';
import { Alert, Button, FileInput, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle, IconFileUpload, IconInfoCircle } from '@tabler/icons-react';
import type { ParsedStatement } from '@budget/shared';
import { api } from '../../lib/api';
import { defaultFunding } from '../../lib/funding';
import { useImportStatus, useLookups } from '../../lib/queries';
import { confirmDiscard, ImportReview, type PaymentRow, type ReviewRow } from './ImportReview';

/** PDF statement import: the server extracts the text and Claude reads the transactions. */
export function ImportStatementModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { data: status } = useImportStatus();
  const { data: lookups } = useLookups();
  const fullScreen = useMediaQuery('(max-width: 48em)');

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [skipped, setSkipped] = useState(0);

  const reset = () => {
    setFile(null);
    setRows(null);
    setPayments([]);
    setError(null);
    setSkipped(0);
  };
  const finish = () => {
    reset();
    onClose();
  };
  const close = () => (rows?.length || payments.length ? confirmDiscard(finish) : finish());

  const parse = async () => {
    if (!file) return;
    setParsing(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const result = await api.post<ParsedStatement>('/api/import/statement', body);
      const card = result.suggestedCardId ? String(result.suggestedCardId) : null;
      setSkipped(result.skippedCount);
      setRows(
        result.rows.map((r) => ({
          key: r.key,
          // Likely duplicates start unchecked so they aren't saved twice by accident.
          include: !r.possibleDuplicate,
          date: r.date,
          description: r.description,
          amount: r.amountCents / 100,
          categoryId: r.categoryId ? String(r.categoryId) : null,
          cardId: card,
          fundingAccountId: defaultFunding(lookups, card),
          note: '',
          flag: r.possibleDuplicate ? 'Possible duplicate' : null,
        })),
      );
      // On a credit card statement the payments are to that card; on a bank statement the user picks.
      const isCreditCard = lookups?.cards.some((c) => String(c.id) === card && c.accountId === null);
      setPayments(
        result.payments.map((p) => ({
          key: p.key,
          include: !p.possibleDuplicate,
          date: p.date,
          description: p.description,
          amount: p.amountCents / 100,
          cardId: isCreditCard ? card : null,
          fromAccountId: lookups?.paymentAccountId ? String(lookups.paymentAccountId) : null,
          flag: p.possibleDuplicate ? 'Already recorded?' : null,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read statement');
    } finally {
      setParsing(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={rows ? 'Review imported transactions' : 'Import statement'}
      size={rows ? '95%' : 'md'}
      fullScreen={fullScreen}
      closeOnClickOutside={!rows}
    >
      {rows ? (
        <ImportReview
          rows={rows}
          setRows={setRows}
          payments={payments}
          setPayments={setPayments}
          summary={skipped > 0 ? `${skipped} transfers/deposits skipped` : undefined}
          onStartOver={reset}
          onSaved={finish}
        />
      ) : (
        <Stack gap="md">
          {status && !status.enabled && (
            <Alert color="yellow" icon={<IconInfoCircle size={18} />}>
              Statement parsing is disabled because no Anthropic API key is configured on the server. You can still use
              CSV import.
            </Alert>
          )}
          <Text size="sm" c="dimmed">
            Upload a PDF statement. It's read in memory, account numbers are masked, and the text is parsed by Claude.
            The file is never saved on the server.
          </Text>
          <FileInput
            label="Statement file"
            placeholder="Choose a .pdf file"
            accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain"
            leftSection={<IconFileUpload size={16} />}
            value={file}
            onChange={setFile}
            clearable
          />
          {error && (
            <Alert color="red" icon={<IconAlertTriangle size={18} />}>
              {error}
            </Alert>
          )}
          {parsing && (
            <Group gap="sm">
              <Loader size="sm" />
              <Text size="sm">Reading statement. This can take up to a minute for long statements…</Text>
            </Group>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button onClick={parse} loading={parsing} disabled={!file || status?.enabled === false}>
              Read statement
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
