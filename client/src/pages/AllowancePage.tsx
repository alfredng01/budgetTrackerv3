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
  MultiSelect,
  NumberInput,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconSettings } from '@tabler/icons-react';
import { formatCents, toCents, type AllowanceSummary } from '@budget/shared';
import { UserFilter } from '../components/ViewFilters';
import { useAllowance, useLookups, useMe, useSaveAllowance } from '../lib/queries';
import { todayIso, useViewParams } from '../lib/view';

function EditAllowanceModal({ summary, onClose }: { summary: AllowanceSummary | null; onClose: () => void }) {
  const { data: lookups } = useLookups();
  const save = useSaveAllowance();
  const [weekly, setWeekly] = useState<number | string>('');
  const [categories, setCategories] = useState<string[]>([]);
  useEffect(() => {
    if (summary) {
      setWeekly(summary.weeklyCents ? summary.weeklyCents / 100 : '');
      setCategories(summary.categoryIds.map(String));
    }
  }, [summary]);

  return (
    <Modal opened={!!summary} onClose={onClose} title="Allowance settings">
      <Stack gap="sm">
        <NumberInput
          label="Weekly allowance"
          description="Added every week starting Jan 1; resets each year"
          prefix="$"
          decimalScale={2}
          thousandSeparator=","
          min={0}
          value={weekly}
          onChange={setWeekly}
        />
        <MultiSelect
          label="Categories paid from the allowance"
          description="Spending in these categories is deducted from your allowance"
          data={(lookups?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
          value={categories}
          onChange={setCategories}
          searchable
          clearable
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            onClick={() =>
              save.mutate(
                { weeklyCents: weekly === '' ? 0 : toCents(weekly), categoryIds: categories.map(Number) },
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

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  return (
    <Card padding="md">
      <Text size="xs" tt="uppercase" fw={600} c="dimmed">
        {label}
      </Text>
      <Text fz={24} fw={700} className={tone}>
        {value}
      </Text>
    </Card>
  );
}

function AllowanceCard({ s, showName, canEdit, onEdit }: { s: AllowanceSummary; showName: boolean; canEdit: boolean; onEdit: () => void }) {
  const { data: lookups } = useLookups();
  const names = new Map((lookups?.categories ?? []).map((c) => [c.id, c.name]));
  const configured = s.weeklyCents > 0 || s.categoryIds.length > 0;

  return (
    <Stack gap="md">
      {showName && <Title order={4}>{s.username}</Title>}
      {!configured ? (
        <Card>
          <Center py="lg">
            <Stack align="center" gap="xs">
              <Text c="dimmed">No allowance set up yet.</Text>
              {canEdit && <Button onClick={onEdit}>Set up allowance</Button>}
            </Stack>
          </Center>
        </Card>
      ) : (
        <>
          <SimpleGrid cols={{ base: 2, md: 4 }}>
            <Tile label="Left to spend" value={formatCents(s.remainingCents)} tone={s.remainingCents >= 0 ? 'positive' : 'negative'} />
            <Tile label={`Earned · week ${s.weeksElapsed}`} value={formatCents(s.earnedCents)} />
            <Tile label="Spent" value={formatCents(s.spentCents)} />
            <Tile label="Per week" value={formatCents(s.weeklyCents)} />
          </SimpleGrid>
          <Group gap={6}>
            <Text size="sm" c="dimmed">
              Deducted from:
            </Text>
            {s.categoryIds.length === 0 ? (
              <Text size="sm" c="dimmed">
                no categories selected
              </Text>
            ) : (
              s.categoryIds.map((id) => (
                <Badge key={id} variant="light">
                  {names.get(id) ?? `#${id}`}
                </Badge>
              ))
            )}
          </Group>
          <Card>
            <Title order={5} mb="sm">
              Allowance spending in {s.year}
            </Title>
            {s.transactions.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                Nothing spent from the allowance yet.
              </Text>
            ) : (
              <div className="table-scroll">
                <Table striped miw={520}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Date</Table.Th>
                      <Table.Th>Description</Table.Th>
                      <Table.Th>Category</Table.Th>
                      <Table.Th ta="right">Amount</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {s.transactions.map((t) => (
                      <Table.Tr key={t.id}>
                        <Table.Td ff="monospace">{t.date}</Table.Td>
                        <Table.Td>{t.description}</Table.Td>
                        <Table.Td>
                          <Badge variant="light" color="gray">
                            {t.categoryName}
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="right" ff="monospace">
                          {formatCents(t.amountCents)}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
    </Stack>
  );
}

export function AllowancePage() {
  const { data: me } = useMe();
  const { userId } = useViewParams();
  const today = todayIso();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const { data, isLoading } = useAllowance(year, today, userId);
  const [editing, setEditing] = useState<AllowanceSummary | null>(null);
  const isAdmin = me?.role === 'admin';
  const mine = data?.[0];

  return (
    <>
      <Group justify="space-between" mb="lg" gap="sm">
        <Title order={2}>Allowance</Title>
        <Group gap="xs">
          <ActionIcon variant="default" size="lg" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}>
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text fw={600} w={56} ta="center">
            {year}
          </Text>
          <ActionIcon variant="default" size="lg" aria-label="Next year" onClick={() => setYear((y) => y + 1)}>
            <IconChevronRight size={18} />
          </ActionIcon>
          <UserFilter />
          {!isAdmin && mine && (
            <Button variant="default" leftSection={<IconSettings size={16} />} onClick={() => setEditing(mine)}>
              Edit allowance
            </Button>
          )}
        </Group>
      </Group>

      {isLoading || !data ? (
        <Center h={200}>
          <Loader />
        </Center>
      ) : (
        <Stack gap="xl">
          {data.map((s) => (
            <AllowanceCard key={s.userId} s={s} showName={isAdmin} canEdit={!isAdmin} onEdit={() => setEditing(s)} />
          ))}
        </Stack>
      )}

      <EditAllowanceModal summary={editing} onClose={() => setEditing(null)} />
    </>
  );
}
