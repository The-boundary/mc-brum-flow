import { Outlet } from 'react-router';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { NoAccessPage } from '@/pages/Auth/NoAccessPage';

export function ProtectedRoute() {
  const { user, loading, access } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
          </div>
          <p className="text-xs text-muted-foreground">Checking access…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    window.location.replace('https://the-boundary.app');
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
          </div>
          <p className="text-xs text-muted-foreground">Redirecting to login…</p>
        </div>
      </div>
    );
  }

  if (!access) {
    return <NoAccessPage />;
  }

  return <Outlet />;
}
