import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

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
    console.error('ErrorBoundary caught an error:', error, errorInfo.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  handleHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-error/10 flex items-center justify-center ring-1 ring-error/20">
              <AlertTriangle className="w-8 h-8 text-error" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground font-display">Something went wrong</h2>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                An unexpected error occurred. You can try again or reload the page.
              </p>
            </div>
            {this.state.error && (
              <details className="text-left bg-surface-100 border border-border rounded-lg overflow-hidden group">
                <summary className="px-4 py-2.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground hover:bg-surface-200 transition-colors select-none">
                  Error details
                </summary>
                <div className="px-4 py-3 border-t border-border bg-surface-75">
                  <p className="text-xs font-mono text-error break-words whitespace-pre-wrap leading-relaxed">
                    {this.state.error.message}
                  </p>
                  {this.state.errorInfo?.componentStack && (
                    <pre className="mt-2 text-[10px] font-mono text-muted-foreground/60 break-words whitespace-pre-wrap max-h-32 overflow-auto">
                      {this.state.errorInfo.componentStack.trim()}
                    </pre>
                  )}
                </div>
              </details>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-foreground hover:bg-surface-300 transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm text-background font-medium hover:bg-brand-500 transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleHome}
                className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-300 transition-colors"
              >
                <Home className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
