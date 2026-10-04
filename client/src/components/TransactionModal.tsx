import { useEffect } from 'react';
import { Button, Group, Input, Modal, NumberInput, SegmentedControl, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { toCents, type Transaction } from '@budget/shared';
import { defaultFunding, fundingChoices } from '../lib/funding';
import { useLookups, useSaveTransaction } from '../lib/queries';
import { defaultDateFor, useViewParams } from '../lib/view';

interface Props {
  opened: boolean;
  onClose: () => void;
  /** When set, the modal edits this transaction instead of creating one. */
  editing?: Transaction | null;
}

interface TxnFormValues {
  date: string;
  description: string;
  note: string;
  amount: number | string;
  categoryId: string;
  cardId: string;
  fundingAccountId: string | null;
}

export function TransactionModal({ opened, onClose, editing }: Props) {
  const { data: lookups } = useLookups();
  const { month } = useViewParams();
  const save = useSaveTransaction();

  const form = useForm<TxnFormValues>({
    initialValues: { date: '', description: '', note: '', amount: '', categoryId: '', cardId: '', fundingAccountId: null },
    validate: {
      date: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Pick a date'),
      description: (v) => (v.trim() ? null : 'Required'),
      amount: (v) => (v !== '' && Number(v) !== 0 ? null : 'Enter a non-zero amount'),
      categoryId: (v) => (v ? null : 'Pick a category'),
      cardId: (v) => (v ? null : 'Pick a card'),
    },
  });

  useEffect(() => {
    if (!opened) return;
    form.setValues<TxnFormValues>(
      editing
        ? {
            date: editing.date,
            description: editing.description,
            note: editing.note,
            amount: editing.amountCents / 100,
            categoryId: String(editing.categoryId),
            cardId: String(editing.cardId),
            fundingAccountId: editing.fundingAccountId ? String(editing.fundingAccountId) : null,
          }
        : {
            date: defaultDateFor(month),
            description: '',
            note: '',
            amount: '',
            categoryId: '',
            cardId: '',
            fundingAccountId: null,
          },
    );
    form.resetDirty();
  }, [opened, editing]);

  const submit = form.onSubmit((v) => {
    save.mutate(
      {
        id: editing?.id,
        input: {
          date: v.date,
          description: v.description.trim(),
          note: v.note.trim(),
          amountCents: toCents(v.amount),
          categoryId: Number(v.categoryId),
          cardId: Number(v.cardId),
          fundingAccountId: v.fundingAccountId ? Number(v.fundingAccountId) : null,
        },
      },
      { onSuccess: onClose },
    );
  });

  const funding = fundingChoices(lookups, form.values.cardId);

  const toOptions = (items: { id: number; name: string }[] = []) => items.map((i) => ({ value: String(i.id), label: i.name }));

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? 'Edit transaction' : 'Add transaction'}>
      <form onSubmit={submit}>
        <Stack gap="sm">
          <TextInput type="date" label="Date" {...form.getInputProps('date')} />
          <TextInput label="Description" placeholder="e.g. Trader Joe's" maxLength={200} {...form.getInputProps('description')} />
          <NumberInput
            label="Amount"
            description="Use a negative amount for refunds or credits"
            prefix="$"
            decimalScale={2}
            thousandSeparator=","
            {...form.getInputProps('amount')}
          />
          <Select
            label="Category"
            data={toOptions(lookups?.categories)}
            searchable
            selectFirstOptionOnChange
            {...form.getInputProps('categoryId')}
          />
          <Select
            label="Card used"
            data={toOptions(lookups?.cards)}
            searchable
            selectFirstOptionOnChange
            {...form.getInputProps('cardId')}
            onChange={(v) => {
              form.setFieldValue('cardId', v ?? '');
              form.setFieldValue('fundingAccountId', defaultFunding(lookups, v));
            }}
          />
          {funding.length > 1 && (
            <Input.Wrapper label="Paid from">
              <SegmentedControl
                fullWidth
                data={funding}
                value={form.values.fundingAccountId ?? funding[0].value}
                onChange={(v) => form.setFieldValue('fundingAccountId', v)}
              />
            </Input.Wrapper>
          )}
          <TextInput label="Note" placeholder="Optional short note" maxLength={500} {...form.getInputProps('note')} />
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
