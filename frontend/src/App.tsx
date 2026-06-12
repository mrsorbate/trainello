import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EventCreatePage from './pages/EventCreatePage';
import EventEditPage from './pages/EventEditPage';
import TeamsPage from './pages/TeamsPage';
import TeamPage from './pages/TeamPage';
import TeamRosterPage from './pages/TeamRosterPage';
import TeamSettingsPage from './pages/TeamSettingsPage';
import TeamPostsPage from './pages/TeamPostsPage';
import EventsPage from './pages/EventsPage';
import EventDetailPage from './pages/EventDetailPage';
import EventSquadPage from './pages/EventSquadPage';
import StatsPage from './pages/StatsPage';
import InvitePage from './pages/InvitePage';
import TeamJoinPage from './pages/TeamJoinPage';
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';
import SetupWizardPage from './pages/SetupWizardPage';
import FirstTimeSetupPage from './pages/FirstTimeSetupPage';
import MySchedulePage from './pages/MySchedulePage';
import MyTablePage from './pages/MyTablePage';
import { settingsAPI } from './lib/api';
import { useDarkMode } from './hooks/useDarkMode';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

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
    staleTime: 0, // Always refetch to ensure fresh data
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
            <Route path="/mein-spielplan" element={<MySchedulePage />} />
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
  );
}

export default App;
