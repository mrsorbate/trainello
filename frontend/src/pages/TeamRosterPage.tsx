import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { invitesAPI, teamsAPI } from '../lib/api';
import { ArrowLeft, Users, X, Link as LinkIcon, Copy, RotateCcw, Shield, User } from 'lucide-react';
import { resolveAssetUrl } from '../lib/utils';
import PlayerInviteManager from '../components/PlayerInviteManager';
import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSmartBack } from '../hooks/useSmartBack';
import { useToast } from '../lib/useToast';
import AccessibleModal from '../components/AccessibleModal';

export default function TeamRosterPage() {
  const { id } = useParams<{ id: string }>();
  const teamId = parseInt(id!);
  const queryClient = useQueryClient();
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [joinLinkCopied, setJoinLinkCopied] = useState(false);
  const { user } = useAuthStore();
  const goBack = useSmartBack();
  const { showToast } = useToast();
  const closeMemberModal = () => {
    setSelectedMember(null);
    setConfirmRemove(false);
  };

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
    <div className={`rounded-xl bg-gray-900/60 border border-gray-700/40 p-3 ${extraClassName}`}>
      <p className="eyebrow-label">{label}</p>
      <p className="mt-0.5 font-semibold text-white break-words">{value}</p>
    </div>
  );

  if (teamLoading || membersLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-9 w-56" />
        <div className="card space-y-3">
          <div className="skeleton h-6 w-24" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
          </div>
        </div>
        <div className="card space-y-3">
          <div className="skeleton h-6 w-20" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start sm:items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => goBack(`/teams/${teamId}`)}
          className="mt-1 sm:mt-0 icon-button rounded-full"
          aria-label="Zurück"
          title="Zurück"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-4xl font-heading font-bold text-white tracking-wide break-words flex items-center gap-2">
            <Users className="w-6 h-6 text-primary-400 shrink-0" />
            <span>Kader — {team?.name}</span>
          </h1>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card">
          <h2 className="section-heading mb-4">
            <Shield className="w-5 h-5 text-primary-400" />
            Trainer
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary-900/40 text-primary-300 border border-primary-700/40">
              {trainers.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {trainers.map((trainer: any) => (
              <button
                key={trainer.id}
                onClick={() => { setSelectedMember(trainer); setConfirmRemove(false); }}
                className="p-3 bg-gray-700/40 border border-gray-700/50 rounded-xl flex items-center gap-3 hover:bg-gray-700/70 hover:border-gray-600/80 hover:shadow-card transition-all duration-150 cursor-pointer text-left w-full"
              >
                <div className="shrink-0">
                  {resolveAssetUrl(trainer.profile_picture) ? (
                    <img
                      src={resolveAssetUrl(trainer.profile_picture)}
                      alt={trainer.name}
                      className="w-11 h-11 rounded-full object-cover border border-gray-600"
                    />
                  ) : (
                    <div className="w-11 h-11 bg-primary-900/50 rounded-full flex items-center justify-center border border-primary-700/40">
                      <span className="text-primary-300 font-heading font-bold text-lg leading-none">
                        {trainer.name.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white text-sm leading-tight truncate">{trainer.name}</p>
                  <p className="text-xs text-primary-400 mt-0.5">Trainer</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="section-heading mb-4">
            <User className="w-5 h-5 text-green-400" />
            Spieler
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-300 border border-green-700/40">
              {players.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {players.map((player: any) => {
              const hasJersey = player.jersey_number != null && player.jersey_number !== '';
              return (
                <button
                  key={player.id}
                  onClick={canOpenPlayerProfiles ? () => { setSelectedMember(player); setConfirmRemove(false); } : undefined}
                  disabled={!canOpenPlayerProfiles}
                  className={`p-3 bg-gray-700/40 border border-gray-700/50 rounded-xl flex items-center gap-3 transition-all duration-150 text-left w-full ${
                    canOpenPlayerProfiles
                      ? 'hover:bg-gray-700/70 hover:border-gray-600/80 hover:shadow-card cursor-pointer'
                      : 'cursor-default'
                  }`}
                >
                  <div className="relative shrink-0">
                    {resolveAssetUrl(player.profile_picture) ? (
                      <img
                        src={resolveAssetUrl(player.profile_picture)}
                        alt={player.name}
                        className="w-11 h-11 rounded-full object-cover border border-gray-600"
                      />
                    ) : (
                      <div className="w-11 h-11 bg-green-900/50 rounded-full flex items-center justify-center border border-green-700/40">
                        <span className="text-green-300 font-heading font-bold text-lg leading-none">
                          {player.name.charAt(0)}
                        </span>
                      </div>
                    )}
                    {hasJersey && (
                      <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-0.5 rounded-full bg-gray-900 border border-gray-600 text-[10px] font-heading font-bold text-gray-300 flex items-center justify-center leading-none">
                        {player.jersey_number}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-white text-sm leading-tight truncate">{player.name}</p>
                    {player.position ? (
                      <p className="text-xs text-green-400 mt-0.5 truncate">{player.position}</p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-0.5">Spieler</p>
                    )}
                  </div>
                </button>
              );
            })}

            {players.length === 0 && (
              <div className="col-span-full empty-state">
                <Users className="empty-state-icon" />
                <p>Noch keine registrierten Spieler im Team</p>
              </div>
            )}
          </div>
        </div>

        {user?.role === 'trainer' && (
          <div className="card space-y-4">
            <h2 className="section-heading">
              <LinkIcon className="w-5 h-5 text-primary-400" />
              Team-Beitrittslink
            </h2>

            <p className="text-sm text-gray-400">
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
                  <p className="text-xs text-gray-400 tabular-nums">
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
	        <AccessibleModal
	          labelledBy="member-profile-title"
	          onClose={closeMemberModal}
	          className="backdrop-blur-sm items-end sm:items-center p-0 sm:p-4"
	          panelClassName="bg-gray-800 border border-gray-700/70 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto shadow-modal"
	        >
	            {/* Hero header */}
	            <div className="relative px-5 pt-6 pb-5 text-center border-b border-gray-700/50">
	              <button
	                onClick={closeMemberModal}
	                className="absolute top-3 right-3 compact-icon-button rounded-full bg-gray-700/60"
	                aria-label="Modal schließen"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Avatar */}
              <div className="relative inline-block mb-3">
                {resolveAssetUrl(selectedMember.profile_picture) ? (
                  <img
                    src={resolveAssetUrl(selectedMember.profile_picture)}
                    alt={selectedMember.name}
                    className="w-24 h-24 rounded-full object-cover border-2 border-gray-600"
                  />
                ) : (
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center border-2 ${
                    selectedMember.role === 'trainer'
                      ? 'bg-primary-900/50 border-primary-700/60'
                      : 'bg-green-900/50 border-green-700/60'
                  }`}>
                    <span className={`text-4xl font-heading font-bold ${
                      selectedMember.role === 'trainer' ? 'text-primary-300' : 'text-green-300'
                    }`}>
                      {selectedMember.name.charAt(0)}
                    </span>
                  </div>
                )}
                {selectedMember.role !== 'trainer' &&
                  selectedMember.jersey_number != null &&
                  selectedMember.jersey_number !== '' && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-gray-900 border border-gray-600 text-xs font-heading font-bold text-white whitespace-nowrap">
                    #{selectedMember.jersey_number}
                  </span>
                )}
              </div>

              <h3 id="member-profile-title" className="text-xl font-heading font-bold text-white tracking-wide">
                {selectedMember.name}
              </h3>

              <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-heading font-semibold border ${
                  selectedMember.role === 'trainer'
                    ? 'bg-primary-900/40 text-primary-300 border-primary-700/40'
                    : 'bg-green-900/40 text-green-300 border-green-700/40'
                }`}>
                  {selectedMember.role === 'trainer' ? (
                    <><Shield className="w-3 h-3" /> Trainer</>
                  ) : (
                    <><User className="w-3 h-3" /> Spieler</>
                  )}
                </span>
                {selectedMember.position && (
                  <span className="text-sm text-gray-400">{selectedMember.position}</span>
                )}
                {selectedMember.nickname && (
                  <span className="text-sm text-gray-400">„{selectedMember.nickname}"</span>
                )}
              </div>
            </div>

            {/* Info grid */}
            <div className="p-5 space-y-4">
              {selectedMember.role !== 'trainer' && (() => {
                const hasJerseyNumber = selectedMember.jersey_number != null && selectedMember.jersey_number !== '';
                const hasPosition = Boolean(selectedMember.position);
                const hasHeight = Boolean(selectedMember.height_cm);
                const hasWeight = Boolean(selectedMember.weight_kg);
                const hasClothingSize = Boolean(selectedMember.clothing_size);
                const hasShoeSize = Boolean(selectedMember.shoe_size);
                const hasFootedness = Boolean(selectedMember.footedness);
                const hasAnyPlayerInfo = hasJerseyNumber || hasPosition || hasHeight || hasWeight || hasClothingSize || hasShoeSize || hasFootedness;

                if (!hasAnyPlayerInfo) {
                  return <p className="text-center text-sm text-gray-400 py-2">Keine Daten hinterlegt.</p>;
                }

                return (
                  <div className="grid grid-cols-2 gap-2">
                    {hasJerseyNumber && renderInfoCard('Trikotnummer', `#${selectedMember.jersey_number}`)}
                    {hasPosition && renderInfoCard('Position', selectedMember.position)}
                    {hasHeight && renderInfoCard('Größe', `${selectedMember.height_cm} cm`)}
                    {hasWeight && renderInfoCard('Gewicht', `${selectedMember.weight_kg} kg`)}
                    {hasClothingSize && renderInfoCard('Kleidergröße', selectedMember.clothing_size)}
                    {hasShoeSize && renderInfoCard('Schuhgröße', selectedMember.shoe_size)}
                    {hasFootedness && renderInfoCard('Füßigkeit', selectedMember.footedness, 'col-span-2 capitalize')}
                  </div>
                );
              })()}

              {selectedMember.role === 'trainer' && (() => {
                const hasPhoneNumber = Boolean(selectedMember.phone_number);
                const hasEmail = Boolean(selectedMember.email);
                if (!hasPhoneNumber && !hasEmail) {
                  return <p className="text-center text-sm text-gray-400 py-2">Keine Kontaktdaten hinterlegt.</p>;
                }
                return (
                  <div className="grid grid-cols-1 gap-2">
                    {hasPhoneNumber && renderInfoCard('Handynummer', selectedMember.phone_number)}
                    {hasEmail && renderInfoCard('E-Mail', selectedMember.email)}
                  </div>
                );
              })()}

	              <button
	                onClick={closeMemberModal}
	                className="btn btn-secondary w-full"
	              >
                Schließen
              </button>

              {user?.role === 'trainer' && selectedMember.role !== 'trainer' && (
                confirmRemove ? (
                  <div className="rounded-xl bg-red-900/10 border border-red-700/40 p-3">
                    <p className="text-sm text-gray-300 text-center mb-3">
                      <span className="font-semibold text-white">{selectedMember.name}</span> wirklich aus dem Team entfernen?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => removePlayerMutation.mutate(selectedMember.id)}
                        disabled={removePlayerMutation.isPending}
                        className="flex-1 btn btn-danger disabled:opacity-50"
                      >
                        {removePlayerMutation.isPending ? 'Entfernt…' : 'Ja, entfernen'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(false)}
                        className="flex-1 btn btn-secondary"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(true)}
                    className="w-full btn btn-secondary text-red-400 border-red-900/50 hover:bg-red-900/20 hover:border-red-700/50"
                  >
                    Aus Team entfernen
                  </button>
                )
              )}
            </div>
	        </AccessibleModal>
	      )}
    </div>
  );
}
