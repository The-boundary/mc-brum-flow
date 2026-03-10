import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function NoAccessPage() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="glass-panel rounded-xl w-full max-w-md p-8">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <ShieldOff className="h-6 w-6 text-warning" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Access not enabled</h1>
            <p className="text-sm text-muted-foreground">Brum Flow access is required</p>
          </div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Your account is authenticated but not assigned to Brum Flow. Contact an admin to request access.
        </p>
        <button
          className="mt-6 w-full rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface-300 transition"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
