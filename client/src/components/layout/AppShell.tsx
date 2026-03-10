import { type ReactNode } from 'react';
import { MissionControlAppShell } from '@the-boundary/design-system';
import { useUiStore } from '@/stores/uiStore';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);

  return (
    <MissionControlAppShell
      sidebar={<Sidebar />}
      collapsed={sidebarCollapsed}
    >
      {children}
    </MissionControlAppShell>
  );
}
