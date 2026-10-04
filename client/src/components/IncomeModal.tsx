import { useEffect } from 'react';
import { Button, Group, Modal, NumberInput, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { toCents, type Income } from '@budget/shared';
import { useLookups, useSaveIncome } from '../lib/queries';
import { defaultDateFor, useViewParams } from '../lib/view';

interface Props {
  opened: boolean;
  onClose: () => void;
  editing?: Income | null;
}

type IncomeFormValues = { date: string; source: string; amount: number | string; accountId: string | null };

export function IncomeModal({ opened, onClose, editing }: Props) {
  const { month } = useViewParams();
  const save = useSaveIncome();
  const { data: lookups } = useLookups();
  const form = useForm<IncomeFormValues>({
    initialValues: { date: '', source: '', amount: '', accountId: null },
    validate: {
      date: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Pick a date'),
      source: (v) => (v.trim() ? null : 'Required'),
      amount: (v) => (v !== '' && Number(v) > 0 ? null : 'Enter a positive amount'),
      accountId: (v) => (v ? null : 'Pick the account it went into'),
    },
  });

  useEffect(() => {
    if (!opened) return;
    form.setValues<IncomeFormValues>(
      editing
        ? {
            date: editing.date,
            source: editing.source,
            amount: editing.amountCents / 100,
            accountId: editing.accountId ? String(editing.accountId) : null,
          }
        : {
            date: defaultDateFor(month),
            source: '',
            amount: '',
            // Paychecks usually land in the main account (the one card payments come from).
            accountId: lookups?.paymentAccountId ? String(lookups.paymentAccountId) : null,
          },
    );
  }, [opened, editing]);

  const submit = form.onSubmit((v) =>
    save.mutate(
      {
        id: editing?.id,
        input: { date: v.date, source: v.source.trim(), amountCents: toCents(v.amount), accountId: Number(v.accountId) },
      },
      { onSuccess: onClose },
    ),
  );

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? 'Edit income' : 'Add income'}>
      <form onSubmit={submit}>
        <Stack gap="sm">
          <TextInput type="date" label="Date" {...form.getInputProps('date')} />
          <TextInput label="Source" placeholder="e.g. Paycheck" maxLength={200} {...form.getInputProps('source')} />
          <NumberInput label="Amount" prefix="$" decimalScale={2} thousandSeparator="," min={0} {...form.getInputProps('amount')} />
          <Select
            label="Deposited to"
            data={(lookups?.accounts ?? []).map((a) => ({ value: String(a.id), label: a.name }))}
            allowDeselect={false}
            {...form.getInputProps('accountId')}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Save' : 'Add'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
