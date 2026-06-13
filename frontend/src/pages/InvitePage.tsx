import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { invitesAPI, settingsAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { resolveAssetUrl } from '../lib/utils';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, token: authToken } = useAuthStore();
  const [showRegister, setShowRegister] = useState(false);

  // Registrierungsformular-State
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

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

  const { data: invite, isLoading, error: inviteError } = useQuery({
    queryKey: ['invite', token],
    queryFn: async () => {
      const response = await invitesAPI.getInviteByToken(token!);
      return response.data;
    },
    enabled: !!token,
    retry: false,
  });
  const inviteErrorMessage =
    (inviteError as any)?.response?.data?.error ||
    (inviteError as any)?.message ||
    'Diese Einladung existiert nicht oder ist abgelaufen.';

  useEffect(() => {
    if (invite?.invite_type === 'team_join_link' && token) {
      navigate(`/join/${token}`, { replace: true });
    }
  }, [invite?.invite_type, navigate, token]);

  const acceptMutation = useMutation({
    mutationFn: () => invitesAPI.acceptInvite(token!),
    onSuccess: (response) => {
      if (user?.role === 'player') {
        navigate('/');
        return;
      }
      navigate(`/teams/${response.data.team_id}`);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Fehler beim Beitreten');
    },
  });

  const registerAndAcceptMutation = useMutation({
    mutationFn: async () => {
      if (!invite?.player_name) {
        throw new Error('Für diese Einladung ist kein fester Name hinterlegt.');
      }

      const response = await invitesAPI.registerWithInvite(token!, { username: username.trim().toLowerCase(), email, password });
      return response;
    },
    onSuccess: (registerResponse) => {
      // Set auth after registration
      const authStore = useAuthStore.getState();
      authStore.setAuth(registerResponse.data.token, registerResponse.data.user);

      const isTrainerRegistration =
        invite.invite_type === 'trainer_setup' ||
        registerResponse.data.user?.role === 'trainer';

      if (isTrainerRegistration) {
        navigate('/');
        return;
      }

      navigate('/');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || err.message || 'Registrierung fehlgeschlagen');
    },
  });

  const handleAccept = () => {
    setError('');
    acceptMutation.mutate();
  };

  const handleExistingAccountLogin = () => {
    if (!token) return;
    navigate(`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`);
  };

  const handleRegisterAndAccept = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    registerAndAcceptMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-300">Einladung wird geladen...</p>
        </div>
      </div>
    );
  }

  if (inviteError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4">
        <div className="max-w-md w-full text-center">
          <XCircle className="mx-auto h-16 w-16 text-red-400 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            Einladung ungültig
          </h2>
          <p className="text-gray-300 mb-6">
            {inviteErrorMessage}
          </p>
          <Link to="/login" className="btn btn-primary">
            Zur Anmeldung
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4">
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

        </div>

        <div className="card text-gray-100">
          <div className="text-center mb-6">
            <p className="text-sm font-semibold text-primary-400 mb-2">
              {invite.invite_type === 'trainer_setup' ? 'Einladung als Trainer' : 'Einladung zum Team'}
            </p>
            {invite.team_name && <h3 className="text-xl sm:text-2xl font-bold text-white break-words">{invite.team_name}</h3>}
            {invite.team_description && (
              <p className="text-sm sm:text-base text-gray-300 mt-2 break-words">{invite.team_description}</p>
            )}
            {invite.player_name && (
              <p className="text-sm text-blue-300 mt-3 font-medium">
                Registrierung ist fest zugeordnet: {invite.player_name}
              </p>
            )}
          </div>

          {invite.expires_at && (
            <div className="flex items-center justify-center text-sm text-gray-300 mb-6">
              <Clock className="w-4 h-4 mr-2" />
              <span>
                Gültig bis: {new Date(invite.expires_at).toLocaleDateString('de-DE')}
              </span>
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-700/60 text-red-400 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {authToken && user ? (
            // User is logged in
            <div className="space-y-4">
              <div className="bg-green-900/30 border border-green-800 rounded-lg p-4">
                <p className="text-sm text-green-100">
                  Angemeldet als <span className="font-medium">{user.name}</span>
                </p>
              </div>
              {invite.invite_type !== 'trainer_setup' ? (
                <button
                  onClick={handleAccept}
                  disabled={acceptMutation.isPending}
                  className="btn btn-primary w-full flex items-center justify-center space-x-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  <span>
                    {acceptMutation.isPending ? 'Trete bei...' : 'Team beitreten'}
                  </span>
                </button>
              ) : (
                <p className="text-sm text-blue-300 bg-blue-900/20 border border-blue-700/60 rounded-lg p-3">
                  Für diese Trainer-Einladung bitte zuerst abmelden und den Account über den Link registrieren.
                </p>
              )}
              <p className="text-center text-sm text-gray-300">
                Nicht {user.name}?{' '}
                <button
                  onClick={() => {
                    useAuthStore.getState().logout();
                  }}
                  className="text-action"
                >
                  Abmelden
                </button>
              </p>
            </div>
          ) : !showRegister ? (
            // User not logged in - show login/register options
            <div className="space-y-4">
              {invite.invite_type !== 'trainer_setup' && (
                <>
                  <button
                    onClick={handleExistingAccountLogin}
                    className="btn btn-primary w-full"
                  >
                    Mit bestehendem Account beitreten
                  </button>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-600"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-gray-800 text-gray-400">oder</span>
                    </div>
                  </div>
                </>
              )}
              {invite.invite_type === 'trainer_setup' && (
                <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-3 text-sm text-blue-200">
                  Richte jetzt deinen Trainer-Account ein und lege Benutzername, E-Mail und Passwort selbst fest.
                </div>
              )}
              <button
                onClick={() => setShowRegister(true)}
                disabled={!invite.player_name}
                className="btn btn-secondary w-full"
              >
                {invite.invite_type === 'trainer_setup' ? 'Trainer-Account einrichten' : 'Neuen Account erstellen'}
              </button>
              {!invite.player_name && (
                <p className="text-xs text-center text-red-400">
                  Für diesen Link ist keine Registrierung möglich, da kein fester Name hinterlegt ist.
                </p>
              )}
            </div>
          ) : (
            // Registration form
            <form onSubmit={handleRegisterAndAccept} className="space-y-4">
              <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-200">
                  <span className="font-medium">Registrierung für:</span> {invite.player_name || 'Nicht hinterlegt'}
                </p>
                {invite.player_birth_date && (
                  <p className="text-sm text-blue-200 mt-1">
                    <span className="font-medium">Geburtsdatum:</span>{' '}
                    {new Date(invite.player_birth_date).toLocaleDateString('de-DE')}
                  </p>
                )}
                {invite.player_jersey_number && (
                  <p className="text-sm text-blue-200 mt-1">
                    <span className="font-medium">Trikotnummer:</span> {invite.player_jersey_number}
                  </p>
                )}
                <p className="text-xs text-blue-300 mt-2">
                  Der Name ist durch die Einladung fest vorgegeben und kann nicht geändert werden.
                </p>
              </div>

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-300">
                  Benutzername *
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
                <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                  E-Mail *
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
                  Passwort *
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

              <button
                type="submit"
                disabled={registerAndAcceptMutation.isPending || !invite.player_name}
                className="btn btn-primary w-full"
              >
                {registerAndAcceptMutation.isPending ? 'Registriert...' : 'Registrieren & Beitreten'}
              </button>

              <button
                type="button"
                onClick={() => setShowRegister(false)}
                className="btn btn-secondary w-full"
              >
                Zurück
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
