import { useEffect, useState } from 'react';
import { Loader2, ExternalLink } from 'lucide-react';

export function LoginPage() {
  const [countdown, setCountdown] = useState(3);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          setRedirecting(true);
          window.location.replace('https://the-boundary.app');
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleRedirectNow = () => {
    setRedirecting(true);
    window.location.replace('https://the-boundary.app');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-display font-semibold text-foreground tracking-tight">BRUM FLOW</h1>
          <p className="text-xs text-muted-foreground">Render Pipeline Manager</p>
        </div>

        <div className="space-y-4">
          {redirecting ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
              </div>
              <p className="text-xs text-muted-foreground">Redirecting to authentication…</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Redirecting in <span className="text-foreground font-medium">{countdown}</span>…
              </p>
              <button
                onClick={handleRedirectNow}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-background hover:bg-brand-500 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Sign in now
              </button>
            </>
          )}
        </div>

        <p className="text-[10px] text-fg-dim">
          Powered by The Boundary
        </p>
      </div>
    </div>
  );
}
