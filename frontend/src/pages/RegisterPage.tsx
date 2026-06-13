import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { authAPI, settingsAPI } from '../lib/api';
import { resolveAssetUrl } from '../lib/utils';
import { useToast } from '../lib/useToast';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'player' | 'trainer'>('player');
  const setAuth = useAuthStore((state) => state.setAuth);
  const { showToast } = useToast();

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

  const registerMutation = useMutation({
    mutationFn: () => {
      // Validate input
      if (!name.trim()) {
        throw new Error('Name ist erforderlich');
      }
      if (!username.trim()) {
        throw new Error('Benutzername ist erforderlich');
      }
      if (!email.trim()) {
        throw new Error('E-Mail ist erforderlich');
      }
      if (password.length < 6) {
        throw new Error('Passwort muss mindestens 6 Zeichen lang sein');
      }
      return authAPI.register({ name, username: username.trim().toLowerCase(), email, password, role });
    },
    onSuccess: (response) => {
      setAuth(response.data.token, response.data.user);
      // Reload page to ensure App.tsx useEffect runs and loads organization
      setTimeout(() => {
        window.location.href = '/';
      }, 100);
    },
    onError: (error: any) => {
      let message = 'Registrierung fehlgeschlagen';
      if (error?.message) {
        message = error.message;
      } else if (error?.response?.data?.error) {
        message = error.response.data.error;
      }
      showToast(message, 'error');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 sm:space-y-8">
        <div className="text-center">
          {/* App Branding */}
          <div className="flex flex-col items-center mb-5 sm:mb-6">
            <img src="/teamvoteplus-logo.svg" alt="teamvote+" className="h-14 sm:h-16 w-auto mb-3" />
          </div>

          {/* Separator */}
          <hr className="my-6 border-gray-600" />

          {/* Organization Info */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 mb-4">
            {organizationLogo && (
              <img 
                src={resolveAssetUrl(organizationLogo)} 
                alt="Vereinslogo" 
                className="h-10 sm:h-12 w-auto object-contain"
              />
            )}
            <h2 className="text-xl sm:text-2xl font-semibold text-white break-words text-center">
              {organizationName}
            </h2>
          </div>

          <p className="mt-2 text-sm text-gray-400">
            Account erstellen
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300">
                Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input mt-1"
                placeholder="Max Mustermann"
              />
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300">
                Benutzername
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input mt-1"
                placeholder="max_mustermann"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                E-Mail
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input mt-1"
                placeholder="deine@email.de"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                Passwort
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input mt-1"
                placeholder="••••••••"
              />
            </div>

            <div>
              <p id="register-role-label" className="block text-sm font-medium text-gray-300">
                Rolle
              </p>
              <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:gap-4" role="radiogroup" aria-labelledby="register-role-label">
                <label htmlFor="register-role-player" className="inline-flex items-center">
                  <input
                    id="register-role-player"
                    type="radio"
                    value="player"
                    checked={role === 'player'}
                    onChange={(e) => setRole(e.target.value as 'player')}
                    className="mr-2"
                  />
                  <span>Spieler</span>
                </label>
                <label htmlFor="register-role-trainer" className="inline-flex items-center">
                  <input
                    id="register-role-trainer"
                    type="radio"
                    value="trainer"
                    checked={role === 'trainer'}
                    onChange={(e) => setRole(e.target.value as 'trainer')}
                    className="mr-2"
                  />
                  <span>Trainer</span>
                </label>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={registerMutation.isPending}
            className="btn btn-primary w-full"
          >
            {registerMutation.isPending ? 'Wird registriert...' : 'Registrieren'}
          </button>

          <p className="text-center text-sm text-gray-300">
            Bereits registriert?{' '}
            <Link to="/login" className="font-medium text-primary-400 hover:text-primary-500">
              Jetzt anmelden
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
