import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { eventsAPI, teamsAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../lib/useToast';
import { resolveAssetUrl } from '../lib/utils';
import { useSmartBack } from '../hooks/useSmartBack';

const MATCH_LINEUP_LAYOUT: Array<{ slot: string; className: string }> = [
  { slot: 'TW', className: 'left-1/2 -translate-x-1/2 bottom-2 sm:bottom-3' },
  { slot: 'LV', className: 'left-[12%] bottom-[22%]' },
  { slot: 'IV1', className: 'left-[36%] bottom-[22%]' },
  { slot: 'IV2', className: 'right-[36%] bottom-[22%]' },
  { slot: 'RV', className: 'right-[12%] bottom-[22%]' },
  { slot: 'DM', className: 'left-1/2 -translate-x-1/2 bottom-[40%]' },
  { slot: 'ZM', className: 'left-[28%] bottom-[54%]' },
  { slot: 'OM', className: 'right-[28%] bottom-[54%]' },
  { slot: 'LF', className: 'left-[12%] bottom-[70%]' },
  { slot: 'ST', className: 'left-1/2 -translate-x-1/2 bottom-[74%]' },
  { slot: 'RF', className: 'right-[12%] bottom-[70%]' },
];

const MATCH_LINEUP_SLOT_ORDER = MATCH_LINEUP_LAYOUT.map((entry) => entry.slot);

type SquadPlayer = {
  id: number;
  name: string;
  profile_picture?: string;
  jersey_number?: number | null;
  response_status?: 'accepted' | 'declined' | 'tentative' | 'pending';
};

export default function EventSquadPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id || '', 10);
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const goBack = useSmartBack();

  const isTrainer = user?.role === 'trainer';

  const [editableSquadUserIds, setEditableSquadUserIds] = useState<number[]>([]);
  const [editableLineupSlots, setEditableLineupSlots] = useState<Array<{ slot: string; user_id: number | null }>>([]);
  const [squadChanged, setSquadChanged] = useState(false);

  const { data: event, isLoading: isEventLoading } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const response = await eventsAPI.getById(eventId);
      return response.data;
    },
    enabled: Number.isFinite(eventId),
  });

  const { data: teamMembers } = useQuery({
    queryKey: ['team-members', Number(event?.team_id)],
    queryFn: async () => {
      const response = await teamsAPI.getMembers(Number(event?.team_id));
      return response.data;
    },
    enabled: Number.isFinite(Number(event?.team_id)) && Number(event?.team_id) > 0,
  });

  const { data: matchSquad, isLoading: isMatchSquadLoading } = useQuery({
    queryKey: ['event-match-squad', eventId],
    queryFn: async () => {
      const response = await eventsAPI.getMatchSquad(eventId);
      return response.data;
    },
    enabled: Number.isFinite(eventId) && event?.type === 'match',
  });

  const saveMatchSquadMutation = useMutation({
    mutationFn: (data: { squad_user_ids: number[]; lineup_slots: Array<{ slot: string; user_id: number | null }> }) =>
      eventsAPI.updateMatchSquad(eventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-match-squad', eventId] });
      setSquadChanged(false);
      showToast('Kader gespeichert', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.error || 'Kader konnte nicht gespeichert werden', 'error');
    },
  });

  const releaseMatchSquadMutation = useMutation({
    mutationFn: () => eventsAPI.releaseMatchSquad(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-match-squad', eventId] });
      showToast('Kader freigegeben', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.error || 'Kader konnte nicht freigegeben werden', 'error');
    },
  });

  const teamMembersById = new Map<number, any>(
    Array.isArray(teamMembers)
      ? teamMembers
          .map((member: any) => [Number(member?.id), member] as const)
          .filter(([memberId]) => Number.isInteger(memberId))
      : []
  );

  const playerMemberIds = new Set<number>(
    Array.isArray(teamMembers)
      ? teamMembers
          .filter((member: any) => String(member?.role || '').toLowerCase() !== 'trainer')
          .map((member: any) => Number(member?.id))
          .filter((memberId: number) => Number.isInteger(memberId))
      : []
  );

  const responseByUserId = new Map<number, any>(
    (event?.responses || [])
      .map((response: any) => [Number(response?.user_id), response] as const)
      .filter((entry: readonly [number, any]) => Number.isInteger(entry[0]))
  );

  const squadCandidatePlayers: SquadPlayer[] = Array.from(playerMemberIds)
    .map((playerId) => {
      const member = teamMembersById.get(playerId);
      const response = responseByUserId.get(playerId);
      const status = String(response?.status || 'pending').toLowerCase();

      return {
        id: playerId,
        name: String(response?.user_name || member?.name || `Spieler ${playerId}`),
        profile_picture: response?.user_profile_picture || member?.profile_picture || undefined,
        response_status: status === 'accepted' || status === 'declined' || status === 'tentative' ? status : 'pending',
      } as SquadPlayer;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const squadPlayerMeta: SquadPlayer[] = Array.isArray(matchSquad?.squad_players)
    ? matchSquad.squad_players.map((player: any) => ({
        id: Number(player?.id),
        name: String(player?.name || ''),
        profile_picture: player?.profile_picture || undefined,
        jersey_number: player?.jersey_number ?? null,
      })).filter((player: SquadPlayer) => Number.isInteger(player.id) && player.name.length > 0)
    : [];

  const canViewMatchSquad = Boolean(event?.type === 'match' && (isTrainer || matchSquad?.is_released === 1));

  useEffect(() => {
    if (!matchSquad) return;

    const onlyPlayerIds = (input: any[]) =>
      input
        .map((entry: any) => Number(entry))
        .filter((entry: number) => Number.isInteger(entry) && playerMemberIds.has(entry));

    const safeSquadUserIds = Array.isArray(matchSquad.squad_user_ids)
      ? onlyPlayerIds(matchSquad.squad_user_ids)
      : [];

    setEditableSquadUserIds(
      safeSquadUserIds
    );
    setEditableLineupSlots(
      Array.isArray(matchSquad.lineup_slots)
        ? matchSquad.lineup_slots.map((entry: any) => ({
            ...entry,
            user_id: safeSquadUserIds.includes(Number(entry?.user_id)) ? Number(entry?.user_id) : null,
          }))
        : []
    );
    setSquadChanged(false);
  }, [matchSquad?.event_id, matchSquad?.updated_at, playerMemberIds.size]);

  const getResponseStatusLabel = (status: SquadPlayer['response_status']) => {
    if (status === 'accepted') return 'Zugesagt';
    if (status === 'declined') return 'Abgesagt';
    if (status === 'tentative') return 'Vielleicht';
    return 'Keine Antwort';
  };

  const responseStatusModules: Array<{
    status: NonNullable<SquadPlayer['response_status']>;
    title: string;
    icon: string;
    titleClass: string;
  }> = [
    { status: 'accepted', title: 'Zugesagt', icon: '✓', titleClass: 'text-green-700 dark:text-green-300' },
    { status: 'declined', title: 'Abgesagt', icon: '✗', titleClass: 'text-red-700 dark:text-red-300' },
    { status: 'tentative', title: 'Vielleicht', icon: '?', titleClass: 'text-yellow-700 dark:text-yellow-300' },
    { status: 'pending', title: 'Keine Antwort', icon: '⏳', titleClass: 'text-gray-700 dark:text-gray-300' },
  ];

  const playersByResponseStatus = responseStatusModules.reduce((accumulator, module) => {
    accumulator[module.status] = squadCandidatePlayers.filter((player) => (player.response_status || 'pending') === module.status);
    return accumulator;
  }, {} as Record<NonNullable<SquadPlayer['response_status']>, SquadPlayer[]>);

  const getPlayerNameById = (userId: number | null | undefined) => {
    if (!userId) return '';
    const fromMeta = squadPlayerMeta.find((player) => Number(player.id) === Number(userId));
    if (fromMeta?.name) return fromMeta.name;
    const fromResponses = squadCandidatePlayers.find((player) => Number(player.id) === Number(userId));
    return fromResponses?.name || `Spieler ${userId}`;
  };

  const renderAvatar = (name: string, profilePicture?: string, sizeClass = 'w-7 h-7') => {
    const avatarUrl = resolveAssetUrl(profilePicture);
    if (avatarUrl) {
      return <img src={avatarUrl} alt={`${name} Profilbild`} className={`${sizeClass} rounded-full object-cover border border-gray-200 dark:border-gray-700 bg-white`} />;
    }
    return <div className={`${sizeClass} rounded-full bg-gray-200 dark:bg-gray-700`} />;
  };

  const toggleSquadPlayer = (userId: number, shouldSelect: boolean) => {
    if (!isTrainer) return;

    setEditableSquadUserIds((prev) => {
      const nextSet = new Set(prev);
      if (shouldSelect) nextSet.add(userId);
      else nextSet.delete(userId);

      if (!shouldSelect) {
        setEditableLineupSlots((prevLineup) => prevLineup.map((entry) => (
          entry.user_id === userId ? { ...entry, user_id: null } : entry
        )));
      }

      return [...nextSet];
    });

    setSquadChanged(true);
  };

  const setLineupPlayerForSlot = (slot: string, rawUserId: string) => {
    if (!isTrainer) return;
    const parsedUserId = rawUserId ? Number(rawUserId) : null;
    const isAllowedUserId = parsedUserId === null || editableSquadUserIds.includes(parsedUserId);
    if (!isAllowedUserId) return;

    setEditableLineupSlots((prev) => {
      const withoutSlot = prev.filter((entry) => entry.slot !== slot);
      return [...withoutSlot, { slot, user_id: parsedUserId }];
    });
    setSquadChanged(true);
  };

  const getLineupUserForSlot = (slot: string): number | null => {
    const found = editableLineupSlots.find((entry) => entry.slot === slot);
    return found ? (found.user_id ?? null) : null;
  };

  const saveMatchSquad = async () => {
    const lineupSlots = editableLineupSlots
      .filter((entry) => MATCH_LINEUP_SLOT_ORDER.includes(String(entry.slot || '').toUpperCase()))
      .map((entry) => ({
        slot: String(entry.slot || '').toUpperCase(),
        user_id: entry.user_id === null || entry.user_id === undefined || !editableSquadUserIds.includes(Number(entry.user_id))
          ? null
          : Number(entry.user_id),
      }));

    await saveMatchSquadMutation.mutateAsync({
      squad_user_ids: [...new Set(editableSquadUserIds)],
      lineup_slots: lineupSlots,
    });
  };

  const releaseMatchSquad = async () => {
    if (editableSquadUserIds.length === 0) {
      showToast('Bitte zuerst mindestens einen Spieler im Kader auswählen', 'warning');
      return;
    }
    if (squadChanged) {
      await saveMatchSquad();
    }
    await releaseMatchSquadMutation.mutateAsync();
  };

  if (isEventLoading) {
    return <div className="text-center py-12 text-gray-600 dark:text-gray-300">Lädt...</div>;
  }

  if (!event) {
    return <div className="text-center py-12 text-gray-600 dark:text-gray-300">Termin nicht gefunden.</div>;
  }

  if (event.type !== 'match') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => goBack(`/events/${eventId}`)}
            aria-label="Zurück zum Termin"
            title="Zurück zum Termin"
            className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white">Kader & Aufstellung</h1>
        </div>
        <div className="card">Diese Seite ist nur für Spieltermine verfügbar.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => goBack(`/events/${eventId}`)}
          className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          aria-label="Zurück"
          title="Zurück"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ClipboardList className="w-7 h-7 text-primary-600" />
          Kader & Aufstellung
        </h1>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{event.title}</h2>
          <span className={`text-xs px-2 py-1 rounded-full ${matchSquad?.is_released === 1 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'}`}>
            {matchSquad?.is_released === 1 ? 'Freigegeben' : 'Entwurf'}
          </span>
        </div>

        {isMatchSquadLoading ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">Kader wird geladen...</p>
        ) : canViewMatchSquad ? (
          <div className="space-y-4">
            {isTrainer && (
              <>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 sm:p-4">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Kader festlegen (nur Spieler)</p>
                  {squadCandidatePlayers.length > 0 ? (
                    <div className="space-y-3">
                      {responseStatusModules.map((module) => {
                        const groupPlayers = playersByResponseStatus[module.status] || [];
                        if (groupPlayers.length === 0) return null;

                        return (
                          <div key={module.status} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 sm:p-3">
                            <h3 className={`font-semibold text-sm mb-2 flex items-center justify-between ${module.titleClass}`}>
                              <span className="flex items-center">
                                <span className="mr-2">{module.icon}</span>
                                {module.title}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                                {groupPlayers.length}
                              </span>
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {groupPlayers.map((player) => {
                                const checked = editableSquadUserIds.includes(player.id);
                                return (
                                  <label key={player.id} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-2">
                                    <input type="checkbox" checked={checked} onChange={(event) => toggleSquadPlayer(player.id, event.target.checked)} className="h-4 w-4" />
                                    <span className="inline-flex items-center gap-2 min-w-0 flex-1">
                                      {renderAvatar(player.name, player.profile_picture, 'w-7 h-7')}
                                      <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{player.name}</span>
                                    </span>
                                    <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                      {getResponseStatusLabel(module.status)}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-300">Keine Spieler im Team gefunden.</p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button type="button" onClick={() => saveMatchSquad()} disabled={saveMatchSquadMutation.isPending || releaseMatchSquadMutation.isPending || !squadChanged} className="btn btn-secondary w-full sm:w-auto">
                    {saveMatchSquadMutation.isPending ? 'Speichert...' : 'Kader speichern'}
                  </button>
                  <button type="button" onClick={() => releaseMatchSquad()} disabled={saveMatchSquadMutation.isPending || releaseMatchSquadMutation.isPending || editableSquadUserIds.length === 0} className="btn btn-primary w-full sm:w-auto">
                    {releaseMatchSquadMutation.isPending ? 'Gibt frei...' : 'Kader freigeben'}
                  </button>
                </div>
              </>
            )}

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Taktik-Board (4-3-3)</p>
              </div>
              <div className="relative h-72 sm:h-80 bg-green-50 dark:bg-green-900/20">
                {MATCH_LINEUP_LAYOUT.map((entry) => {
                  const selectedUserId = getLineupUserForSlot(entry.slot);
                  const selectedLabel = getPlayerNameById(selectedUserId);
                  return (
                    <div key={entry.slot} className={`absolute ${entry.className} w-[84px] sm:w-[96px]`}>
                      <div className="rounded-lg border border-green-200 dark:border-green-800 bg-white/90 dark:bg-gray-800/90 p-1.5 text-center shadow-sm">
                        <p className="text-[10px] font-semibold text-green-700 dark:text-green-300 mb-1">{entry.slot}</p>
                        {isTrainer ? (
                          <select
                            value={selectedUserId ?? ''}
                            onChange={(event) => setLineupPlayerForSlot(entry.slot, event.target.value)}
                            aria-label={`Aufstellung ${entry.slot}`}
                            title={`Aufstellung ${entry.slot}`}
                            className="w-full text-[11px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 px-1 py-1"
                          >
                            <option value="">-</option>
                            {editableSquadUserIds.map((userId) => (
                              <option key={`${entry.slot}-${userId}`} value={userId}>
                                {getPlayerNameById(userId)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-[11px] text-gray-700 dark:text-gray-200 truncate">{selectedLabel || '-'}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300">Der Kader wurde noch nicht freigegeben.</p>
        )}
      </div>
    </div>
  );
}
