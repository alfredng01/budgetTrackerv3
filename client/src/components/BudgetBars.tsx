import { Anchor, Box, Center, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';
import { formatCents, type BudgetProgress } from '@budget/shared';

/**
 * Bullet-style bars: each row is scaled to max(limit, spent). The grey track is the
 * limit, the blue fill is spending within it, and the red segment past the tick is the overage.
 */
export function BudgetBars({ budgets }: { budgets: BudgetProgress[] }) {
  const location = useLocation();

  if (budgets.length === 0) {
    return (
      <Center h={120}>
        <Text c="dimmed" size="sm">
          No budget limits set.{' '}
          <Anchor component={Link} to={{ pathname: '/budgets', search: location.search }}>
            Set limits
          </Anchor>
        </Text>
      </Center>
    );
  }

  const sorted = [...budgets].sort((a, b) => b.overCents / b.limitCents - a.overCents / a.limitCents);

  return (
    <Stack gap="md">
      {sorted.map((b) => {
        const spent = Math.max(b.spentCents, 0);
        const scale = Math.max(b.limitCents, spent);
        const within = Math.min(spent, b.limitCents) / scale;
        const over = Math.max(spent - b.limitCents, 0) / scale;
        const limitAt = b.limitCents / scale;
        const isOver = b.overCents > 0;

        return (
          <div key={b.categoryId}>
            <Group justify="space-between" gap="xs" mb={4} wrap="nowrap">
              <Text size="sm" fw={500}>
                {b.categoryName}
              </Text>
              <Group gap={6} wrap="nowrap">
                <Text size="sm" ff="monospace">
                  {formatCents(b.spentCents)} / {formatCents(b.limitCents)}
                </Text>
                {isOver ? (
                  <Group gap={2} className="negative" wrap="nowrap">
                    <IconAlertTriangle size={14} />
                    <Text size="sm" fw={600} inherit>
                      {formatCents(b.overCents)} over
                    </Text>
                  </Group>
                ) : (
                  <Group gap={2} c="dimmed" wrap="nowrap">
                    <IconCircleCheck size={14} />
                    <Text size="sm" inherit>
                      {formatCents(-b.overCents)} left
                    </Text>
                  </Group>
                )}
              </Group>
            </Group>
            <Tooltip
              label={`${b.categoryName}: spent ${formatCents(b.spentCents)} of ${formatCents(b.limitCents)}${
                isOver ? ` (${formatCents(b.overCents)} over)` : ''
              }`}
            >
              <Box pos="relative" h={12} role="img" aria-label={`${b.categoryName} budget progress`}>
                <Box pos="absolute" left={0} top={2} h={8} w={`${limitAt * 100}%`} bg="var(--track)" style={{ borderRadius: 4 }} />
                <Box
                  pos="absolute"
                  left={0}
                  top={2}
                  h={8}
                  w={`${within * 100}%`}
                  bg="var(--series-1)"
                  style={{ borderRadius: over > 0 ? '4px 0 0 4px' : 4 }}
                />
                {over > 0 && (
                  <Box
                    pos="absolute"
                    // 2px surface gap between the in-budget and over-budget segments.
                    left={`calc(${within * 100}% + 2px)`}
                    top={2}
                    h={8}
                    w={`calc(${over * 100}% - 2px)`}
                    bg="var(--status-critical)"
                    style={{ borderRadius: '0 4px 4px 0' }}
                  />
                )}
                <Box
                  pos="absolute"
                  left={`calc(${limitAt * 100}% - 1px)`}
                  top={0}
                  h={12}
                  w={2}
                  bg="var(--mantine-color-text)"
                  style={{ borderRadius: 1, opacity: 0.6 }}
                />
              </Box>
            </Tooltip>
          </div>
        );
      })}
    </Stack>
  );
}
