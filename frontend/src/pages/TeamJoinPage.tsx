import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { authAPI, invitesAPI, settingsAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../lib/useToast';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { resolveAssetUrl } from '../lib/utils';

export default function TeamJoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, setAuth } = useAuthStore();
  const { showToast } = useToast();
  const [joinComplete, setJoinComplete] = useState(false);
  const [teamData, setTeamData] = useState<any>(null);
  const [registerName, setRegisterName] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Fetch invite details
  const { data: inviteData, isLoading: isLoadingInvite, error: inviteError } = useQuery({
    queryKey: ['invite', token],
    queryFn: async () => {
      if (!token) throw new Error('Kein Token vorhanden');
      const response = await invitesAPI.getInviteByToken(token);
      return response.data;
    },
    enabled: !!token,
  });

  const { data: organization } = useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      const response = await settingsAPI.getOrganization();
      return response.data;
    },
    retry: false,
  });

  useEffect(() => {
    if (inviteData) {
      setTeamData(inviteData);
    }
  }, [inviteData]);

  // Mutation for accepting the invite
  const acceptInviteMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Kein Token vorhanden');
      return invitesAPI.acceptInvite(token);
    },
    onSuccess: (response: any) => {
      setJoinComplete(true);
      showToast(`Du bist dem Team "${teamData?.team_name}" beigetreten!`, 'success');
      
      // Redirect nach 2 Sekunden
      setTimeout(() => {
        navigate(`/teams/${response.data.team_id || teamData?.team_id}`, { replace: true });
      }, 2000);
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || 'Fehler beim Beitreten';
      showToast(errorMessage, 'error');
      
      // Nach 3 Sekunden zurück
      setTimeout(() => {
        navigate(-1);
      }, 3000);
    },
  });

  const registerMutation = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Kein Token vorhanden');
      return invitesAPI.registerWithInvite(token, {
        name: registerName.trim(),
        username: registerUsername.trim(),
        email: registerEmail.trim(),
        password: registerPassword,
      });
    },
    onSuccess: (response: any) => {
      const authToken = response?.data?.token;
      const authUser = response?.data?.user;

      if (authToken && authUser) {
        setAuth(authToken, authUser);
      }

      showToast('Konto erstellt und Team beigetreten', 'success');
      window.setTimeout(() => {
        navigate('/', { replace: true });
      }, 500);
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.error || 'Registrierung fehlgeschlagen', 'error');
    },
  });

  const handleRegister = () => {
    if (!registerName.trim()) {
      showToast('Bitte Namen eingeben', 'warning');
      return;
    }

    if (!registerUsername.trim()) {
      showToast('Bitte Benutzernamen eingeben', 'warning');
      return;
    }

    if (!registerEmail.trim()) {
      showToast('Bitte E-Mail eingeben', 'warning');
      return;
    }

    if (registerPassword.length < 6) {
      showToast('Passwort muss mindestens 6 Zeichen haben', 'warning');
      return;
    }

    if (registerPassword !== registerPasswordConfirm) {
      showToast('Passwörter stimmen nicht überein', 'warning');
      return;
    }

    registerMutation.mutate();
  };

  const loginAndJoinMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('Kein Token vorhanden');

      const loginResponse = await authAPI.login(loginUsername.trim(), loginPassword);
      const authToken = loginResponse?.data?.token;
      const authUser = loginResponse?.data?.user;

      if (!authToken || !authUser) {
        throw new Error('Login fehlgeschlagen');
      }

      setAuth(authToken, authUser);
      const joinResponse = await invitesAPI.acceptInvite(token);
      return { authUser, joinResponse };
    },
    onSuccess: ({ authUser, joinResponse }: any) => {
      showToast(`Willkommen zurück ${authUser?.name || ''}! Du bist dem Team beigetreten.`, 'success');
      const targetTeamId = joinResponse?.data?.team_id || teamData?.team_id;
      window.setTimeout(() => {
        navigate(`/teams/${targetTeamId}`, { replace: true });
      }, 500);
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.error || error?.message || 'Anmelden fehlgeschlagen', 'error');
    },
  });

  const handleExistingAccountLogin = () => {
    if (!loginUsername.trim()) {
      showToast('Bitte Benutzername eingeben', 'warning');
      return;
    }

    if (!loginPassword) {
      showToast('Bitte Passwort eingeben', 'warning');
      return;
    }

    loginAndJoinMutation.mutate();
  };

  if (isLoadingInvite) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Lade Team-Informationen...</p>
        </div>
      </div>
    );
  }

  if (inviteError || !teamData) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="max-w-md w-full">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
                  Link ungültig oder abgelaufen
                </h2>
                <p className="text-sm text-red-800 dark:text-red-200 mb-4">
                  {(inviteError as any)?.response?.data?.error || 'Dieser Beitrittslink ist nicht mehr gültig oder wurde bereits zu oft verwendet.'}
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  Bitte kontaktiere den Trainer des Teams, um einen neuen Link zu erhalten.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (joinComplete) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-600 dark:text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Willkommen im Team!
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Du bist dem Team <span className="font-semibold">"{teamData?.team_name}"</span> beigetreten.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Du wirst gleich zur Team-Seite weitergeleitet...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            {resolveAssetUrl(organization?.logo) ? (
              <img
                src={resolveAssetUrl(organization?.logo)}
                alt={organization?.name || 'Vereinswappen'}
                className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-600"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center border border-primary-200 dark:border-primary-700">
                <span className="text-primary-700 dark:text-primary-200 font-bold text-lg">T</span>
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">teamvote+</p>
              <p className="text-base font-semibold text-gray-900 dark:text-white">
                {organization?.name || 'Dein Verein'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Offizieller Team-Beitritt</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Dem Team beitreten
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Bist du bereit, dem Team beizutreten?
            </p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              {teamData?.team_name}
            </h3>
            {teamData?.team_description && (
              <p className="text-sm text-blue-800 dark:text-blue-200">
                {teamData.team_description}
              </p>
            )}
            {teamData?.invited_by_name && (
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                Eingeladen von: {teamData.invited_by_name}
              </p>
            )}
          </div>

          <div className="space-y-3">
            {user ? (
              <>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Angemeldet als: <span className="font-semibold">{user.name}</span>
                  </p>
                </div>
                <button
                  onClick={() => acceptInviteMutation.mutate()}
                  disabled={acceptInviteMutation.isPending}
                  className="btn btn-primary w-full"
                >
                  {acceptInviteMutation.isPending ? 'Wird beigetreten...' : 'Beitreten'}
                </button>
              </>
            ) : (
              <>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Neu hier? Direkt registrieren</p>

                  <input
                    type="text"
                    className="input w-full"
                    placeholder="Dein Name"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                  />

                  <input
                    type="text"
                    className="input w-full"
                    placeholder="Benutzername"
                    value={registerUsername}
                    onChange={(e) => setRegisterUsername(e.target.value)}
                  />

                  <input
                    type="email"
                    className="input w-full"
                    placeholder="E-Mail"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                  />

                  <input
                    type="password"
                    className="input w-full"
                    placeholder="Passwort (mind. 6 Zeichen)"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                  />

                  <input
                    type="password"
                    className="input w-full"
                    placeholder="Passwort wiederholen"
                    value={registerPasswordConfirm}
                    onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
                  />

                  <button
                    onClick={handleRegister}
                    disabled={registerMutation.isPending}
                    className="btn btn-secondary w-full"
                  >
                    {registerMutation.isPending ? 'Registriert...' : 'Konto erstellen und Team beitreten'}
                  </button>
                </div>

                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Ich habe bereits ein Konto</p>

                  <input
                    type="text"
                    className="input w-full"
                    placeholder="Benutzername"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                  />

                  <input
                    type="password"
                    className="input w-full"
                    placeholder="Passwort"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />

                  <button
                    onClick={handleExistingAccountLogin}
                    disabled={loginAndJoinMutation.isPending}
                    className="btn btn-primary w-full"
                  >
                    {loginAndJoinMutation.isPending ? 'Meldet an...' : 'Anmelden und Team beitreten'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
