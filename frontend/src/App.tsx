import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import { settingsAPI } from './lib/api';
import { useDarkMode } from './hooks/useDarkMode';
import { useQuery } from '@tanstack/react-query';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const EventCreatePage = lazy(() => import('./pages/EventCreatePage'));
const EventEditPage = lazy(() => import('./pages/EventEditPage'));
const TeamsPage = lazy(() => import('./pages/TeamsPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const TeamRosterPage = lazy(() => import('./pages/TeamRosterPage'));
const TeamSettingsPage = lazy(() => import('./pages/TeamSettingsPage'));
const TeamPostsPage = lazy(() => import('./pages/TeamPostsPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const EventDetailPage = lazy(() => import('./pages/EventDetailPage'));
const EventSquadPage = lazy(() => import('./pages/EventSquadPage'));
const StatsPage = lazy(() => import('./pages/StatsPage'));
const InvitePage = lazy(() => import('./pages/InvitePage'));
const TeamJoinPage = lazy(() => import('./pages/TeamJoinPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SetupWizardPage = lazy(() => import('./pages/SetupWizardPage'));
const FirstTimeSetupPage = lazy(() => import('./pages/FirstTimeSetupPage'));
const MyTablePage = lazy(() => import('./pages/MyTablePage'));

interface NetworkInformationLike extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

function NetworkStatusBanner() {
  const [isOnline, setIsOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine
  ));
  const [isSlowConnection, setIsSlowConnection] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    let slowConnectionTimer: number | undefined;

    const updateNetworkState = () => {
      if (slowConnectionTimer !== undefined) {
        window.clearTimeout(slowConnectionTimer);
        slowConnectionTimer = undefined;
      }

      setIsOnline(navigator.onLine);
      const effectiveType = String(connection?.effectiveType || '');
      const looksSlow = effectiveType === 'slow-2g'
        || effectiveType === '2g'
        || Number(connection?.rtt || 0) > 1200
        || (Number(connection?.downlink || 0) > 0 && Number(connection?.downlink || 0) < 0.7);

      if (!navigator.onLine) {
        setIsSlowConnection(false);
        return;
      }

      if (!looksSlow) {
        setIsSlowConnection(false);
        return;
      }

      slowConnectionTimer = window.setTimeout(() => {
        if (navigator.onLine) setIsSlowConnection(true);
        slowConnectionTimer = undefined;
      }, 1500);
    };

    updateNetworkState();
    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);
    connection?.addEventListener?.('change', updateNetworkState);

    return () => {
      window.removeEventListener('online', updateNetworkState);
      window.removeEventListener('offline', updateNetworkState);
      connection?.removeEventListener?.('change', updateNetworkState);
      if (slowConnectionTimer !== undefined) {
        window.clearTimeout(slowConnectionTimer);
      }
    };
  }, []);

  if (isOnline && !isSlowConnection) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-3 right-3 z-[65] rounded-xl border px-3 py-2 text-sm shadow-modal backdrop-blur-sm ${isOnline
        ? 'top-[calc(env(safe-area-inset-top,0px)+0.75rem)] border-amber-700/60 bg-amber-950/90 text-amber-100'
        : 'top-[calc(env(safe-area-inset-top,0px)+0.75rem)] border-red-700/60 bg-red-950/90 text-red-100'
      }`}
    >
      {isOnline
        ? 'Langsame Verbindung. Inhalte und Aktionen können etwas länger dauern.'
        : 'Du bist offline. Bereits geladene Inhalte bleiben sichtbar; Änderungen werden erst wieder online gespeichert.'}
    </div>
  );
}

function App() {
  const { token } = useAuthStore();
  useDarkMode(); // Initialize dark mode
  const [showLoadWarning, setShowLoadWarning] = useState(false);

  // Fetch organization using React Query
  const { data: organization, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      const response = await settingsAPI.getOrganization();
      return response.data;
    },
    retry: 1,
  });

  useEffect(() => {
    if (!isLoading) {
      setShowLoadWarning(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowLoadWarning(true);
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [isLoading]);

  const setupCompleted = isError ? true : organization?.setup_completed === 1;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <NetworkStatusBanner />
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-300">App wird geladen...</p>
          {showLoadWarning && (
            <div className="mt-4 text-sm text-gray-400 max-w-sm">
              <p className="mb-3">Das Laden dauert ungewöhnlich lange. Prüfe bitte die API-Verbindung.</p>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="btn btn-secondary"
              >
                Erneut versuchen
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <NetworkStatusBanner />
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-900"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div></div>}>
      <Routes>
      {/* First-time setup (no login required) */}
      {!setupCompleted && !token && <Route path="*" element={<FirstTimeSetupPage />} />}

      {/* Normal flow: login/register only available after setup */}
      {setupCompleted && !token && (
        <>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<Navigate to="/login" />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/join/:token" element={<TeamJoinPage />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </>
      )}

      {/* Authenticated routes */}
      {token && (
        <>
          {/* Setup wizard for completing org setup (logo, etc) */}
          <Route
            path="/setup"
            element={
              !setupCompleted ? (
                <SetupWizardPage />
              ) : (
                <Navigate to="/" />
              )
            }
          />

          <Route element={<Layout organization={organization} />}>
            <Route path="/" element={!setupCompleted ? <Navigate to="/setup" /> : <DashboardPage />} />
            <Route path="/join/:token" element={<TeamJoinPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/mein-spielplan" element={<Navigate to="/events" replace />} />
            <Route path="/meine-tabelle" element={<MyTablePage />} />
            <Route path="/events/new" element={<EventCreatePage />} />
            <Route path="/teams/:id" element={<TeamPage />} />
            <Route path="/teams/:id/kader" element={<TeamRosterPage />} />
            <Route path="/teams/:id/settings" element={<TeamSettingsPage />} />
            <Route path="/teams/:id/posts" element={<TeamPostsPage />} />
            <Route path="/teams/:id/events" element={<EventsPage />} />
            <Route path="/teams/:id/events/new" element={<EventCreatePage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/events/:id/squad" element={<EventSquadPage />} />
            <Route path="/events/:id/edit" element={<EventEditPage />} />
            <Route path="/teams/:id/stats" element={<StatsPage />} />
          </Route>
        </>
      )}
      </Routes>
      </Suspense>
    </>
  );
}

export default App;
