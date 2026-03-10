import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-error/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-error" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">An unexpected error occurred. Please try again or refresh the page.</p>
            </div>
            {import.meta.env.DEV && this.state.error && (
              <div className="text-left bg-error/5 border border-error/20 rounded-lg p-4 overflow-auto max-h-48">
                <p className="text-xs font-mono text-error break-words">{this.state.error.message}</p>
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              <button onClick={this.handleRetry} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface-300 transition">
                <RefreshCw className="w-4 h-4" /> Try Again
              </button>
              <button onClick={this.handleReload} className="rounded-lg bg-brand px-4 py-2 text-sm text-background font-medium hover:bg-brand-500 transition">
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
