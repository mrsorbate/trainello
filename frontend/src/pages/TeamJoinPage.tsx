import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { invitesAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../lib/useToast';
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';

export default function TeamJoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const [joinComplete, setJoinComplete] = useState(false);
  const [teamData, setTeamData] = useState<any>(null);

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
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-primary-600 hover:text-primary-700 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Zurück
          </button>
          
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
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-primary-600 hover:text-primary-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </button>

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

          {!user ? (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm text-amber-900 dark:text-amber-100">
                Du musst angemeldet sein, um beizutreten. Melde dich an oder erstelle ein Konto.
              </p>
            </div>
          ) : null}

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
                <button
                  onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/join/${token}`)}`)}
                  className="btn btn-primary w-full"
                >
                  Anmelden
                </button>
                <button
                  onClick={() => navigate(`/register?redirect=${encodeURIComponent(`/join/${token}`)}`)}
                  className="btn btn-secondary w-full"
                >
                  Registrieren
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
