import { Center, Group, SimpleGrid, Table, Text } from '@mantine/core';
import { DonutChart } from '@mantine/charts';
import { formatCents, type CategoryTotal } from '@budget/shared';
import { useLookups } from '../lib/queries';
import { categoryColors } from '../theme';

export function CategoryBreakdown({ data, totalCents }: { data: CategoryTotal[]; totalCents: number }) {
  const { data: lookups } = useLookups();
  const categoryColor = categoryColors(lookups?.categoryIdsByAge ?? []);

  // Wedges can't be negative (a category that's net-refunded is shown in the table only).
  const positive = data.filter((d) => d.totalCents > 0).sort((a, b) => b.totalCents - a.totalCents);

  if (positive.length === 0) {
    return (
      <Center h={240}>
        <Text c="dimmed">No spending recorded this month.</Text>
      </Center>
    );
  }

  const wedges = positive.map((d) => ({ name: d.categoryName, value: d.totalCents / 100, color: categoryColor(d.categoryId) }));
  const pct = (cents: number) => (totalCents > 0 ? `${Math.round((cents / totalCents) * 100)}%` : '—');

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      <Center>
        <DonutChart
          data={wedges}
          size={220}
          thickness={34}
          paddingAngle={1}
          strokeWidth={2}
          withTooltip
          tooltipDataSource="segment"
          valueFormatter={(v) => formatCents(Math.round(v * 100))}
          chartLabel={formatCents(totalCents)}
        />
      </Center>
      <Table verticalSpacing={4} aria-label="Spending by category" style={{ alignSelf: 'center' }}>
        <Table.Tbody>
          {[...positive, ...data.filter((d) => d.totalCents <= 0)].map((d) => (
            <Table.Tr key={d.categoryId}>
              <Table.Td>
                <Group gap={8} wrap="nowrap">
                  <span className="swatch" style={{ background: categoryColor(d.categoryId) }} />
                  <Text size="sm">{d.categoryName}</Text>
                </Group>
              </Table.Td>
              <Table.Td ta="right">
                <Text size="sm" ff="monospace">
                  {formatCents(d.totalCents)}
                </Text>
              </Table.Td>
              <Table.Td ta="right" w={56}>
                <Text size="sm" c="dimmed">
                  {d.totalCents > 0 ? pct(d.totalCents) : ''}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </SimpleGrid>
  );
}
