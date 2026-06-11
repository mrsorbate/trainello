import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authAPI, settingsAPI } from '../lib/api';
import { resolveAssetUrl } from '../lib/utils';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);

  useEffect(() => {
    const fromQuery = searchParams.get('reason') === 'session-expired';
    const fromStorage = localStorage.getItem('session-expired-notice') === '1';

    if (fromQuery || fromStorage) {
      setSessionExpiredNotice(true);
      localStorage.removeItem('session-expired-notice');
    }
  }, [searchParams]);

  // Fetch organization info
  const { data: organization } = useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      const response = await settingsAPI.getOrganization();
      return response.data;
    },
    retry: 1,
  });

  const organizationName = organization?.name || 'Dein Verein';
  const organizationLogo = organization?.logo;

  const loginMutation = useMutation({
    mutationFn: () => authAPI.login(username, password),
    onSuccess: (response) => {
      setAuth(response.data.token, response.data.user);
      // Reload page to ensure App.tsx useEffect runs and loads organization
      setTimeout(() => {
        window.location.href = '/';
      }, 100);
    },
    onError: (error: any) => {
      setError(error.response?.data?.error || 'Login fehlgeschlagen');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    loginMutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 sm:space-y-8">
        <div className="text-center">
          {/* App Branding */}
          <div className="flex flex-col items-center mb-5 sm:mb-6">
            <img src="/teamvoteplus-logo.svg" alt="teamvote+" className="h-14 sm:h-16 w-auto mb-3" />
          </div>

          {/* Separator */}
          <hr className="my-6 border-gray-300 dark:border-gray-600" />

          {/* Organization Info */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 mb-4">
            {organizationLogo && (
              <img 
                src={resolveAssetUrl(organizationLogo)} 
                alt="Vereinslogo" 
                className="h-10 sm:h-12 w-auto object-contain"
              />
            )}
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white break-words text-center">
              {organizationName}
            </h2>
          </div>

          <p className="mt-3 sm:mt-4 text-sm text-gray-600 dark:text-gray-400">
            Melde dich an, um fortzufahren
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {sessionExpiredNotice && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-200">
              Aus Sicherheitsgründen musst du dich alle 30 Tage neu einloggen.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Benutzername
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input mt-1"
                placeholder="dein_benutzername"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Passwort
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input mt-1"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="btn btn-primary w-full"
          >
            {loginMutation.isPending ? 'Wird angemeldet...' : 'Anmelden'}
          </button>

          <p className="text-center text-sm text-gray-300">
            Registrierung nur per persönlichem Einladungslink.
          </p>
        </form>
      </div>
    </div>
  );
}
