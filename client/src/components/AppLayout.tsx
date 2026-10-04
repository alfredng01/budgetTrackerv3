import {
  ActionIcon,
  AppShell,
  Badge,
  Burger,
  Group,
  Menu,
  NavLink,
  Text,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBuildingBank,
  IconCalendarStats,
  IconCreditCard,
  IconChartPie,
  IconLogout,
  IconMoon,
  IconPigMoney,
  IconReceipt,
  IconSettings,
  IconSun,
  IconTargetArrow,
  IconUserCircle,
  IconWallet,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { SessionUser } from '@budget/shared';
import { authClient } from '../lib/auth';
import { keys } from '../lib/queries';

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconChartPie },
  { to: '/transactions', label: 'Transactions', icon: IconReceipt },
  { to: '/income', label: 'Income', icon: IconPigMoney },
  { to: '/accounts', label: 'Accounts', icon: IconBuildingBank },
  { to: '/credit-cards', label: 'Credit cards', icon: IconCreditCard },
  { to: '/allowance', label: 'Allowance', icon: IconWallet },
  { to: '/budgets', label: 'Budgets', icon: IconTargetArrow },
  { to: '/history', label: 'History', icon: IconCalendarStats },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

export function AppLayout({ user }: { user: SessionUser }) {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');

  const signOut = async () => {
    await authClient.signOut().catch(() => undefined);
    // Clear the user first so the app swaps to the login screen and unmounts the data pages;
    // clearing their queries while still mounted would refetch them and hit "Not signed in".
    qc.setQueryData(keys.me, null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== keys.me[0] });
    navigate('/login', { replace: true });
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />
            <Title order={4}>Budget Tracker</Title>
          </Group>
          <Group gap="xs">
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Toggle color scheme"
              onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
            >
              {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
            <Menu position="bottom-end" width={200}>
              <Menu.Target>
                <ActionIcon variant="default" size="lg" aria-label="Account menu">
                  <IconUserCircle size={20} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  <Group gap={6}>
                    <Text size="sm" fw={600}>
                      {user.username}
                    </Text>
                    {user.role === 'admin' && (
                      <Badge size="xs" variant="light">
                        admin
                      </Badge>
                    )}
                  </Group>
                </Menu.Label>
                <Menu.Item leftSection={<IconLogout size={16} />} onClick={signOut}>
                  Sign out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            component={Link}
            // Preserve the selected month/user when switching pages.
            to={{ pathname: item.to, search: location.search }}
            label={item.label}
            leftSection={<item.icon size={18} stroke={1.6} />}
            active={location.pathname === item.to}
            onClick={close}
          />
        ))}
        {user.role === 'admin' && (
          <Text size="xs" c="dimmed" mt="auto" p="xs">
            Read-only overview of all users.
          </Text>
        )}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
