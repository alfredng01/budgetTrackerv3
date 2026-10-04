import { Card, Group, SimpleGrid, Text } from '@mantine/core';
import { IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';
import { formatCents } from '@budget/shared';

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  return (
    <Card padding="md">
      <Text size="xs" tt="uppercase" fw={600} c="dimmed">
        {label}
      </Text>
      <Group gap={6} mt={4} className={tone} wrap="nowrap">
        {tone === 'positive' && <IconTrendingUp size={22} aria-hidden />}
        {tone === 'negative' && <IconTrendingDown size={22} aria-hidden />}
        <Text fz={28} fw={700} inherit lh={1.2}>
          {value}
        </Text>
      </Group>
    </Card>
  );
}

interface Props {
  spentCents: number;
  incomeCents: number;
  netCents: number;
  /** Year-to-date allowance left as of today; omitted when no allowance is set up. */
  allowanceCents?: number | null;
}

export function StatTiles({ spentCents, incomeCents, netCents, allowanceCents }: Props) {
  const sign = netCents > 0 ? '+' : netCents < 0 ? '−' : '';
  const hasAllowance = allowanceCents !== undefined && allowanceCents !== null;
  return (
    <SimpleGrid cols={{ base: 1, sm: hasAllowance ? 2 : 3, lg: hasAllowance ? 4 : 3 }}>
      <Tile label="Spent" value={formatCents(spentCents)} />
      <Tile label="Income" value={formatCents(incomeCents)} />
      <Tile
        label={netCents >= 0 ? 'Net (saved)' : 'Net (overspent)'}
        value={`${sign}${formatCents(Math.abs(netCents))}`}
        tone={netCents >= 0 ? 'positive' : 'negative'}
      />
      {hasAllowance && (
        <Tile
          label="Allowance left (today)"
          value={formatCents(allowanceCents)}
          tone={allowanceCents >= 0 ? 'positive' : 'negative'}
        />
      )}
    </SimpleGrid>
  );
}
