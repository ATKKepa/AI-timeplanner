import type { ReactNode } from 'react';
import {
  AppShell,
  Burger,
  Group,
  NavLink,
  ScrollArea,
  Text,
} from '@mantine/core';
import {
  IconMessageCircle,
  IconChecklist,
  IconCalendar,
} from '@tabler/icons-react';
import { useState } from 'react';

export type Page = 'chat' | 'tasks' | 'calendar';

interface AppLayoutProps {
  activePage: Page;
  onChangePage: (page: Page) => void;
  children: ReactNode;
}

export function AppLayout({ activePage, onChangePage, children }: AppLayoutProps) {
  const [opened, setOpened] = useState(true);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={() => setOpened((o) => !o)}
              hiddenFrom="sm"
              size="sm"
            />
            <Text fw={600}>AI Timeplanner</Text>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <AppShell.Section grow component={ScrollArea}>
          <NavLink
            label="Chat"
            leftSection={<IconMessageCircle size={18} />}
            active={activePage === 'chat'}
            onClick={() => onChangePage('chat')}
          />
          <NavLink
            label="Tehtävät"
            leftSection={<IconChecklist size={18} />}
            active={activePage === 'tasks'}
            onClick={() => onChangePage('tasks')}
          />
          <NavLink
            label="Kalenteri"
            leftSection={<IconCalendar size={18} />}
            active={activePage === 'calendar'}
            onClick={() => onChangePage('calendar')}
          />
        </AppShell.Section>

        <AppShell.Section>
          <Text fz="xs" c="dimmed" px="xs" pb="xs">
            v0.1 – local dev
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
