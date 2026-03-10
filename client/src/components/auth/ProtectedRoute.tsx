import { Outlet } from 'react-router';
import { useAuth } from '@/context/AuthContext';
import { NoAccessPage } from '@/pages/Auth/NoAccessPage';

export function ProtectedRoute() {
  const { user, loading, access } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Checking access…</div>
      </div>
    );
  }

  if (!user) {
    window.location.replace('https://the-boundary.app');
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Redirecting to login…</div>
      </div>
    );
  }

  if (!access) {
    return <NoAccessPage />;
  }

  return <Outlet />;
}
