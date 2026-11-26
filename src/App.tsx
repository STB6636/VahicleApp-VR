import React from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { queryClient } from '@/lib/queryClient';
import { getAppRouterConfig } from '@/lib/routerMode';
import { ToastContainer } from '@/components/common/ToastContainer';
import { PortalOnlyGuard } from '@/components/auth/PortalOnlyGuard';
import { VehicleShell } from '@/components/layout/VehicleShell';
import { SsoCallbackPage } from '@/pages/SsoCallbackPage';
import { PortalAccessBlockedPage } from '@/pages/PortalAccessBlockedPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { VehiclesPage } from '@/pages/VehiclesPage';
import { ActivitiesPage } from '@/pages/ActivitiesPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';

function DynamicRouter({ children }: { children: React.ReactNode }) {
  const { mode, basename } = getAppRouterConfig();
  if (mode === 'browser') {
    return <BrowserRouter basename={basename}>{children}</BrowserRouter>;
  }
  return <HashRouter>{children}</HashRouter>;
}

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <DynamicRouter>
          <Routes>
            {/* Public SSO Handshake & Portal-Only Lock Screen (NO standalone login form) */}
            <Route path="/sso-callback" element={<SsoCallbackPage />} />
            <Route path="/portal-required" element={<PortalAccessBlockedPage />} />

            {/* Protected App Routes — strictly require verified Portal SSO-VR session */}
            <Route
              element={
                <PortalOnlyGuard>
                  <VehicleShell />
                </PortalOnlyGuard>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/vehicles" element={<VehiclesPage />} />
              <Route path="/activities" element={<ActivitiesPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route
                path="/settings"
                element={
                  <PortalOnlyGuard requireSuperAdmin>
                    <SettingsPage />
                  </PortalOnlyGuard>
                }
              />
            </Route>

            {/* Direct root or unknown routes pass through PortalOnlyGuard */}
            <Route
              path="/"
              element={
                <PortalOnlyGuard>
                  <Navigate to="/dashboard" replace />
                </PortalOnlyGuard>
              }
            />
            <Route
              path="*"
              element={
                <PortalOnlyGuard>
                  <Navigate to="/dashboard" replace />
                </PortalOnlyGuard>
              }
            />
          </Routes>
          <ToastContainer />
        </DynamicRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
