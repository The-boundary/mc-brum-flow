import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { LayoutDashboard, Settings, LogOut } from 'lucide-react';
import {
  MissionControlSidebar,
  type SidebarSection,
  type SidebarUserAction,
} from '@the-boundary/design-system';
import { useUiStore } from '@/stores/uiStore';
import { useAuth } from '@/context/AuthContext';

const sections: SidebarSection[] = [
  {
    key: 'main',
    items: [
      { key: 'dashboard', label: 'BRUM FLOW', href: '/', icon: <LayoutDashboard className="h-4 w-4" /> },
    ],
  },
];

const bottomSections: SidebarSection[] = [
  {
    key: 'bottom',
    items: [
      { key: 'settings', label: 'Settings', href: '/settings', icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

const SHORT_COMMIT_HASH =
  typeof __GIT_COMMIT_HASH__ === 'string' && __GIT_COMMIT_HASH__
    ? __GIT_COMMIT_HASH__.slice(0, 7)
    : 'dev';

export function Sidebar() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const sidebarMobileOpen = useUiStore((s) => s.sidebarMobileOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSidebarMobileOpen = useUiStore((s) => s.setSidebarMobileOpen);
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = useCallback(async () => {
    await signOut();
    navigate('/auth/login');
  }, [signOut, navigate]);

  const handleNavigateItem = useCallback(
    (item: { href: string | null }) => {
      if (item.href) navigate(item.href);
    },
    [navigate],
  );

  const displayName = user?.email?.split('@')[0] ?? 'User';
  const userInfo = { name: displayName, email: user?.email ?? '' };

  const userActions: SidebarUserAction[] = [
    { key: 'logout', label: 'Log out', icon: LogOut, onSelect: handleSignOut },
  ];

  return (
    <MissionControlSidebar
      brandAlt="Brum Flow"
      sections={sections}
      bottomSections={bottomSections}
      pathname={location.pathname}
      collapsed={sidebarCollapsed}
      mobileOpen={sidebarMobileOpen}
      onToggleCollapsed={toggleSidebar}
      onMobileOpenChange={setSidebarMobileOpen}
      onNavigateItem={handleNavigateItem}
      user={userInfo}
      userActions={userActions}
      commitHash={SHORT_COMMIT_HASH}
    />
  );
}
