import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { invitesAPI, teamsAPI } from '../lib/api';
import { ArrowLeft, Users, X, Link as LinkIcon, Copy, RotateCcw } from 'lucide-react';
import { resolveAssetUrl } from '../lib/utils';
import PlayerInviteManager from '../components/PlayerInviteManager';
import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSmartBack } from '../hooks/useSmartBack';
import { useToast } from '../lib/useToast';

export default function TeamRosterPage() {
  const { id } = useParams<{ id: string }>();
  const teamId = parseInt(id!);
  const queryClient = useQueryClient();
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [joinLinkCopied, setJoinLinkCopied] = useState(false);
  const { user } = useAuthStore();
  const goBack = useSmartBack();
  const { showToast } = useToast();

  const { data: team, isLoading: teamLoading } = useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const response = await teamsAPI.getById(teamId);
      return response.data;
    },
  });

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['team-members', teamId],
    queryFn: async () => {
      const response = await teamsAPI.getMembers(teamId);
      return response.data;
    },
  });

  const { data: joinLink } = useQuery({
    queryKey: ['team-join-link', teamId],
    queryFn: async () => {
      try {
        const response = await invitesAPI.getTeamJoinLink(teamId);
        return response.data;
      } catch (error: any) {
        if (error?.response?.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: Number.isFinite(teamId) && user?.role === 'trainer',
    retry: false,
  });

  const createTeamJoinLinkMutation = useMutation({
    mutationFn: () => invitesAPI.createTeamJoinLink(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-join-link', teamId] });
      showToast('Team-Beitrittslink generiert', 'success');
      setJoinLinkCopied(false);
    },
    onError: (mutationError: any) => {
      showToast(mutationError?.response?.data?.error || 'Fehler beim Generieren des Links', 'error');
    },
  });

  const removePlayerMutation = useMutation({
    mutationFn: (userId: number) => teamsAPI.removeMember(teamId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
      setSelectedMember(null);
      showToast('Spieler wurde aus dem Team entfernt', 'success');
    },
    onError: (mutationError: any) => {
      showToast(mutationError?.response?.data?.error || 'Spieler konnte nicht entfernt werden', 'error');
    },
  });

  const copyTextToClipboard = async (value: string): Promise<boolean> => {
    // Prefer modern clipboard API when available (requires secure context).
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // Fall through to legacy copy approach.
      }
    }

    try {
      const textArea = document.createElement('textarea');
      textArea.value = value;
      textArea.setAttribute('readonly', '');
      textArea.style.position = 'fixed';
      textArea.style.top = '-9999px';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch {
      return false;
    }
  };

  const copyJoinLink = async () => {
    if (!joinLink?.join_url) {
      showToast('Kein Beitrittslink verfügbar', 'warning');
      return;
    }

    try {
      const copied = await copyTextToClipboard(joinLink.join_url);
      if (!copied) {
        throw new Error('copy failed');
      }
      showToast('Beitrittslink kopiert', 'success');
      setJoinLinkCopied(true);
      setTimeout(() => setJoinLinkCopied(false), 2000);
    } catch {
      showToast('Beitrittslink konnte nicht kopiert werden', 'error');
    }
  };

  const trainers = members?.filter((m: any) => m.role === 'trainer') || [];
  const players = members?.filter((m: any) => m.role !== 'trainer') || [];
  const canOpenPlayerProfiles = user?.role === 'trainer' || user?.role === 'admin';

  const renderInfoCard = (label: string, value: string, extraClassName = '') => (
    <div className={`rounded-lg bg-gray-50 dark:bg-gray-800 p-3 ${extraClassName}`}>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm text-gray-900 dark:text-white break-words">{value}</p>
    </div>
  );

  if (teamLoading || membersLoading) {
    return <div className="text-center py-12">Lädt...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start sm:items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => goBack(`/teams/${teamId}`)}
          className="mt-1 sm:mt-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          aria-label="Zurück"
          title="Zurück"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white break-words flex items-center gap-2">
            <Users className="w-6 h-6 text-primary-600 shrink-0" />
            <span>Trainer &amp; Spieler - {team?.name}</span>
          </h1>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card">
          <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-900 dark:text-white">
            <span className="mr-2">👨‍🏫</span>
            Trainer
            <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
              {trainers.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {trainers.map((trainer: any) => (
              <button
                key={trainer.id}
                onClick={() => setSelectedMember(trainer)}
                className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center space-x-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer text-left"
              >
                {resolveAssetUrl(trainer.profile_picture) ? (
                  <img
                    src={resolveAssetUrl(trainer.profile_picture)}
                    alt={trainer.name}
                    className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                  />
                ) : (
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-primary-600 font-semibold">
                      {trainer.name.charAt(0)}
                    </span>
                  </div>
                )}
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{trainer.name}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-900 dark:text-white">
            <span className="mr-2">⚽</span>
            Spieler
            <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200">
              {players.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {players.map((player: any) => (
              <button
                key={player.id}
                onClick={canOpenPlayerProfiles ? () => setSelectedMember(player) : undefined}
                disabled={!canOpenPlayerProfiles}
                className={`p-3 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center space-x-3 transition-colors text-left ${
                  canOpenPlayerProfiles
                    ? 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                    : 'opacity-75 cursor-default'
                }`}
              >
                {resolveAssetUrl(player.profile_picture) ? (
                  <img
                    src={resolveAssetUrl(player.profile_picture)}
                    alt={player.name}
                    className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                  />
                ) : (
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 font-semibold">{player.name.charAt(0)}</span>
                  </div>
                )}
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{player.name}</p>
                </div>
              </button>
            ))}

            {players.length === 0 && (
              <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
                <p>Noch keine registrierten Spieler im Team</p>
              </div>
            )}
          </div>
        </div>

        {user?.role === 'trainer' && (
          <div className="card space-y-4">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-primary-600" />
              Team-Beitrittslink
            </h2>

            <p className="text-sm text-gray-600 dark:text-gray-300">
              Spieler können mit diesem allgemeinen Link selbst dem Team beitreten.
            </p>

            {joinLink?.join_url ? (
              <>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    readOnly
                    value={joinLink.join_url}
                    className="input w-full"
                    aria-label="Team-Beitrittslink"
                  />
                  <button
                    type="button"
                    onClick={copyJoinLink}
                    className="btn btn-secondary w-full sm:w-auto whitespace-nowrap inline-flex items-center justify-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    {joinLinkCopied ? 'Kopiert!' : 'Kopieren'}
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Verwendungen: {Number(joinLink.used_count || 0)} von {Number(joinLink.max_uses || 0)}
                  </p>
                  <button
                    type="button"
                    onClick={() => createTeamJoinLinkMutation.mutate()}
                    disabled={createTeamJoinLinkMutation.isPending}
                    className="btn btn-secondary w-full sm:w-auto disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {createTeamJoinLinkMutation.isPending ? 'Generiert...' : 'Link neu generieren'}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => createTeamJoinLinkMutation.mutate()}
                disabled={createTeamJoinLinkMutation.isPending}
                className="btn btn-primary w-full sm:w-auto disabled:opacity-50"
              >
                {createTeamJoinLinkMutation.isPending ? 'Generiert...' : 'Beitrittslink generieren'}
              </button>
            )}
          </div>
        )}

        {user?.role === 'trainer' && <PlayerInviteManager teamId={teamId} />}
      </div>

      {/* Member Profile Modal */}
      {selectedMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="card max-w-md w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="member-profile-title">
            <div className="flex items-start justify-between mb-4">
              <h3 id="member-profile-title" className="font-semibold text-gray-900 dark:text-white">
                Profil
              </h3>
              <button
                onClick={() => setSelectedMember(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Schließen"
                aria-label="Modal schließen"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-center">
                {resolveAssetUrl(selectedMember.profile_picture) ? (
                  <img
                    src={resolveAssetUrl(selectedMember.profile_picture)}
                    alt={selectedMember.name}
                    className="w-32 h-32 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
                  />
                ) : (
                  <div className={`w-32 h-32 rounded-full flex items-center justify-center border-2 ${
                    selectedMember.role === 'trainer'
                      ? 'bg-primary-100 border-primary-200 dark:bg-primary-900/40 dark:border-primary-700'
                      : 'bg-green-100 border-green-200 dark:bg-green-900/40 dark:border-green-700'
                  }`}>
                    <span className={`text-5xl font-semibold ${
                      selectedMember.role === 'trainer'
                        ? 'text-primary-600 dark:text-primary-300'
                        : 'text-green-600 dark:text-green-300'
                    }`}>
                      {selectedMember.name.charAt(0)}
                    </span>
                  </div>
                )}
              </div>

              <div className="text-center">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedMember.name}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                  {selectedMember.role === 'trainer' ? 'Trainer' : 'Spieler'}
                </p>
                {selectedMember.nickname && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">„{selectedMember.nickname}“</p>
                )}
              </div>

              {selectedMember.role !== 'trainer' && (
                (() => {
                  const hasJerseyNumber = selectedMember.jersey_number !== null && selectedMember.jersey_number !== undefined && selectedMember.jersey_number !== '';
                  const hasPosition = Boolean(selectedMember.position);
                  const hasHeight = Boolean(selectedMember.height_cm);
                  const hasWeight = Boolean(selectedMember.weight_kg);
                  const hasClothingSize = Boolean(selectedMember.clothing_size);
                  const hasShoeSize = Boolean(selectedMember.shoe_size);
                  const hasFootedness = Boolean(selectedMember.footedness);
                  const hasAnyPlayerInfo = hasJerseyNumber || hasPosition || hasHeight || hasWeight || hasClothingSize || hasShoeSize || hasFootedness;

                  if (!hasAnyPlayerInfo) {
                    return (
                      <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                        Keine Daten hinterlegt.
                      </p>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-center">
                      {hasJerseyNumber && (
                        renderInfoCard('Trikotnummer', `#${selectedMember.jersey_number}`)
                      )}

                      {hasPosition && (
                        renderInfoCard('Position', selectedMember.position)
                      )}

                      {hasHeight && (
                        renderInfoCard('Größe', `${selectedMember.height_cm} cm`)
                      )}

                      {hasWeight && (
                        renderInfoCard('Gewicht', `${selectedMember.weight_kg} kg`)
                      )}

                      {hasClothingSize && (
                        renderInfoCard('Kleidergröße', selectedMember.clothing_size)
                      )}

                      {hasShoeSize && (
                        renderInfoCard('Schuhgröße', selectedMember.shoe_size)
                      )}

                      {hasFootedness && (
                        renderInfoCard('Füßigkeit', selectedMember.footedness, 'sm:col-span-2 capitalize')
                      )}
                    </div>
                  );
                })()
              )}

              {selectedMember.role === 'trainer' && (
                (() => {
                  const hasPhoneNumber = Boolean(selectedMember.phone_number);
                  const hasEmail = Boolean(selectedMember.email);
                  const hasAnyTrainerInfo = hasPhoneNumber || hasEmail;

                  if (!hasAnyTrainerInfo) {
                    return (
                      <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                        Keine Daten hinterlegt.
                      </p>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 gap-3 text-center">
                      {hasPhoneNumber && (
                        renderInfoCard('Handynummer', selectedMember.phone_number)
                      )}

                      {hasEmail && (
                        renderInfoCard('E-Mail', selectedMember.email)
                      )}
                    </div>
                  );
                })()
              )}

              <button
                onClick={() => setSelectedMember(null)}
                className="btn btn-secondary w-full"
              >
                Schließen
              </button>

              {user?.role === 'trainer' && selectedMember.role !== 'trainer' && (
                <button
                  type="button"
                  disabled={removePlayerMutation.isPending}
                  onClick={() => {
                    const confirmed = window.confirm(`Spieler ${selectedMember.name} wirklich aus dem Team entfernen?`);
                    if (!confirmed) return;
                    removePlayerMutation.mutate(selectedMember.id);
                  }}
                  className="btn btn-danger w-full disabled:opacity-50"
                >
                  {removePlayerMutation.isPending ? 'Entfernt...' : 'Spieler aus Team entfernen'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
