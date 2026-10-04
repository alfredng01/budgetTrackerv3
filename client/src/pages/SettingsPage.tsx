import { useEffect, useState, type ReactNode } from 'react';
import {
  ActionIcon,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Lookups, SettingsInput } from '@budget/shared';
import { api } from '../lib/api';
import { keys, useLookups } from '../lib/queries';

interface EditItem {
  /** Stable key; existing items also carry their database id. */
  key: string;
  id?: number;
  name: string;
  /** Cards only: key of the linked account item (so renaming an account in the same edit keeps the link). */
  accountKey?: string | null;
}

interface Draft {
  categories: EditItem[];
  cards: EditItem[];
  accounts: EditItem[];
  paymentAccountKey: string | null;
}

const itemKey = (id: number) => `id-${id}`;

function toDraft(l: Lookups): Draft {
  return {
    categories: l.categories.map((c) => ({ key: itemKey(c.id), id: c.id, name: c.name })),
    accounts: l.accounts.map((a) => ({ key: itemKey(a.id), id: a.id, name: a.name })),
    cards: l.cards.map((c) => ({
      key: itemKey(c.id),
      id: c.id,
      name: c.name,
      accountKey: c.accountId ? itemKey(c.accountId) : null,
    })),
    paymentAccountKey: l.paymentAccountId ? itemKey(l.paymentAccountId) : null,
  };
}

function toPayload(d: Draft): SettingsInput {
  const accountName = new Map(d.accounts.map((a) => [a.key, a.name.trim()]));
  const base = ({ id, name }: EditItem) => ({ ...(id ? { id } : {}), name: name.trim() });
  return {
    categories: d.categories.map(base),
    accounts: d.accounts.map(base),
    // A link to an account that was removed in this edit falls back to "credit card".
    cards: d.cards.map((c) => ({ ...base(c), account: (c.accountKey && accountName.get(c.accountKey)) || null })),
    paymentAccount: (d.paymentAccountKey && accountName.get(d.paymentAccountKey)) || '',
  };
}

function ListEditor({
  title,
  description,
  noun,
  items,
  onChange,
  renderExtra,
}: {
  title: string;
  description?: string;
  noun: string;
  items: EditItem[];
  onChange: (items: EditItem[]) => void;
  /** Extra control shown under each item (e.g. a card's linked account). */
  renderExtra?: (item: EditItem) => ReactNode;
}) {
  const [draft, setDraft] = useState('');
  const names = items.map((i) => i.name.trim().toLowerCase());
  const isDupe = (name: string, index: number) => names.indexOf(name.trim().toLowerCase()) !== index;

  const add = () => {
    const name = draft.trim();
    if (!name || names.includes(name.toLowerCase())) return;
    onChange([...items, { key: `new-${crypto.randomUUID()}`, name, accountKey: null }]);
    setDraft('');
  };
  const move = (index: number, delta: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };

  return (
    <Card>
      <Title order={4}>{title}</Title>
      {description && (
        <Text size="sm" c="dimmed" mt={4}>
          {description}
        </Text>
      )}
      <Stack gap={renderExtra ? 'sm' : 6} mt="md">
        {items.map((item, i) => (
          <Stack key={item.key} gap={4}>
            <Group gap={4} wrap="nowrap">
              <TextInput
                flex={1}
                aria-label={`${noun} name`}
                value={item.name}
                maxLength={60}
                error={!item.name.trim() ? 'Required' : isDupe(item.name, i) ? 'Duplicate name' : undefined}
                onChange={(e) => {
                  const name = e.currentTarget.value;
                  onChange(items.map((x) => (x.key === item.key ? { ...x, name } : x)));
                }}
              />
              <ActionIcon variant="subtle" color="gray" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <IconArrowUp size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Move down"
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
              >
                <IconArrowDown size={16} />
              </ActionIcon>
              <Tooltip label={items.length === 1 ? `Keep at least one ${noun}` : `Remove ${noun}`}>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={`Remove ${noun}`}
                  disabled={items.length === 1}
                  onClick={() => onChange(items.filter((x) => x.key !== item.key))}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {renderExtra?.(item)}
          </Stack>
        ))}
        <Group gap={4} wrap="nowrap" mt="xs">
          <TextInput
            flex={1}
            placeholder={`New ${noun}`}
            value={draft}
            maxLength={60}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={add} disabled={!draft.trim()}>
            Add
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export function SettingsPage() {
  const { data: lookups, isLoading } = useLookups();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lookups) setDraft(toDraft(lookups));
  }, [lookups]);

  if (isLoading || !lookups || !draft) {
    return (
      <Center h={300}>
        <Loader />
      </Center>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const payload = toPayload(draft);
  const dirty = JSON.stringify(payload) !== JSON.stringify(toPayload(toDraft(lookups)));
  const hasErrors =
    !payload.paymentAccount ||
    [payload.categories, payload.cards, payload.accounts].some((list) => {
      const names = list.map((i) => i.name.toLowerCase());
      return names.some((n) => !n) || new Set(names).size !== names.length;
    });

  const accountOptions = draft.accounts
    .filter((a) => a.name.trim())
    .map((a) => ({ value: a.key, label: a.name.trim() }));

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.put<Lookups>('/api/settings', payload);
      qc.setQueryData(keys.lookups, saved);
      // Renames change labels on existing transactions, budgets, accounts and charts.
      qc.invalidateQueries({ queryKey: keys.data });
      notifications.show({ color: 'teal', message: 'Settings saved' });
    } catch (e) {
      notifications.show({ color: 'red', title: 'Could not save', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Group justify="space-between" mb="xs" gap="sm">
        <Title order={2}>Settings</Title>
        <Group gap="xs">
          <Button variant="default" disabled={!dirty || saving} onClick={() => setDraft(toDraft(lookups))}>
            Discard changes
          </Button>
          <Button disabled={!dirty || hasErrors} loading={saving} onClick={save}>
            Save changes
          </Button>
        </Group>
      </Group>
      <Text size="sm" c="dimmed" mb="lg" maw={760}>
        These lists are shared by everyone and saved to <code>config.json</code>. Renaming updates existing records.
        Removing only hides an entry from dropdowns, so past records keep their label. Each category keeps its own chart
        colour.
      </Text>
      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="lg">
        <ListEditor
          title="Purchase categories"
          noun="category"
          items={draft.categories}
          onChange={(categories) => set({ categories })}
        />
        <ListEditor
          title="Cards"
          description="Cards with no linked account are credit cards (paid off later and listed on the Credit cards tab). Link debit-style cards to the account they draw from."
          noun="card"
          items={draft.cards}
          onChange={(cards) => set({ cards })}
          renderExtra={(item) => (
            <Select
              size="xs"
              ml="sm"
              w={260}
              aria-label={`${item.name} draws from`}
              placeholder="Credit card (no linked account)"
              data={accountOptions}
              value={item.accountKey ?? null}
              clearable
              onChange={(v) => set({ cards: draft.cards.map((c) => (c.key === item.key ? { ...c, accountKey: v } : c)) })}
              leftSection={
                <Text size="xs" c="dimmed" pl={6}>
                  ↳
                </Text>
              }
            />
          )}
        />
        <Stack gap="lg">
          <ListEditor
            title="Accounts"
            description="Where money sits. Balances are tracked per user on the Accounts tab."
            noun="account"
            items={draft.accounts}
            onChange={(accounts) => set({ accounts })}
          />
          <Card>
            <Select
              label="Credit card payments come from"
              description="Also the default for income deposits, and the bank option for Venmo purchases."
              data={accountOptions}
              value={draft.paymentAccountKey}
              error={!payload.paymentAccount ? 'Choose an account' : undefined}
              allowDeselect={false}
              onChange={(v) => set({ paymentAccountKey: v })}
            />
          </Card>
        </Stack>
      </SimpleGrid>
    </>
  );
}
