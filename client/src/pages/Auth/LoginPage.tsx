import { useEffect } from 'react';

export function LoginPage() {
  useEffect(() => {
    window.location.replace('https://the-boundary.app');
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <p className="text-sm text-muted-foreground">Redirecting to login…</p>
    </div>
  );
}
