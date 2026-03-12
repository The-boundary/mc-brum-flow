import { Suspense, lazy } from 'react';
import { Route, Routes, Outlet } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { LoginPage } from './pages/Auth/LoginPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

const BrumFlowPage = lazy(() => import('./pages/BrumFlow/BrumFlowPage'));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Loading…</div>
    </div>
  );
}

function AppShellLayout() {
  return (
    <AppShell>
      <Outlet context={{}} />
    </AppShell>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <ErrorBoundary>
        <Routes>
          <Route path="/auth/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShellLayout />}>
              <Route path="/" element={<BrumFlowPage />} />
              <Route path="*" element={<BrumFlowPage />} />
            </Route>
          </Route>
        </Routes>
      </ErrorBoundary>
    </Suspense>
  );
}
