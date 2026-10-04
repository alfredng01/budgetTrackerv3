import type { ReactNode } from 'react';
import { ActionIcon, Group, Select, Title } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useMe, useUsers } from '../lib/queries';
import { monthLabel, useViewParams } from '../lib/view';

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Admin-only selector: "All users" or one user. Renders nothing for regular users. */
export function UserFilter() {
  const { data: me } = useMe();
  const isAdmin = me?.role === 'admin';
  const { data: users } = useUsers(isAdmin);
  const { userId, setUser } = useViewParams();
  if (!isAdmin) return null;
  return (
    <Select
      aria-label="User"
      w={180}
      data={[{ value: '', label: 'All users' }, ...(users ?? []).map((u) => ({ value: u.id, label: u.username }))]}
      value={userId ?? ''}
      onChange={(v) => setUser(v || null)}
      allowDeselect={false}
    />
  );
}

/** Page header with month navigation (and the admin user filter) in one row. */
export function ViewFilters({ title, actions, hideMonth }: { title: string; actions?: ReactNode; hideMonth?: boolean }) {
  const { month, setMonth } = useViewParams();
  const [y, m] = month.split('-').map(Number);

  return (
    <Group justify="space-between" mb="lg" gap="sm">
      <Title order={2}>{title}</Title>
      <Group gap="xs" wrap="wrap">
        {!hideMonth && (
          <Group gap={4} wrap="nowrap">
            <ActionIcon variant="default" size="lg" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
              <IconChevronLeft size={18} />
            </ActionIcon>
            <MonthPickerInput
              aria-label="Month"
              w={170}
              value={new Date(y, m - 1, 1)}
              valueFormatter={() => monthLabel(month)}
              onChange={(v) => {
                if (!v) return;
                const d = new Date(v);
                setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
              }}
            />
            <ActionIcon variant="default" size="lg" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
              <IconChevronRight size={18} />
            </ActionIcon>
          </Group>
        )}
        <UserFilter />
        {actions}
      </Group>
    </Group>
  );
}
