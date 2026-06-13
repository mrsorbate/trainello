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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-300">Lädt...</p>
          {showLoadWarning && (
            <div className="mt-4 text-sm text-gray-400 max-w-sm">
              <p className="mb-3">Das Laden dauert ungewöhnlich lange. Prüfe bitte die API-Verbindung.</p>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="px-3 py-2 rounded-md bg-gray-800 border border-gray-600 text-gray-200 hover:bg-gray-700 disabled:opacity-60"
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
  );
}

export default App;
