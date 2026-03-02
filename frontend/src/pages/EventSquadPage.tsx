import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { eventsAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../lib/useToast';
import { resolveAssetUrl } from '../lib/utils';

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
};

export default function EventSquadPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id || '', 10);
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  const squadCandidatePlayers: SquadPlayer[] = Array.from(
    new Map<number, SquadPlayer>(
      (event?.responses || []).map((response: any) => [
        Number(response.user_id),
        {
          id: Number(response.user_id),
          name: String(response.user_name || ''),
          profile_picture: response.user_profile_picture || undefined,
        },
      ])
    ).values()
  )
    .filter((player) => Number.isInteger(player.id))
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
    setEditableSquadUserIds(
      Array.isArray(matchSquad.squad_user_ids)
        ? matchSquad.squad_user_ids.map((entry: any) => Number(entry)).filter((entry: number) => Number.isInteger(entry))
        : []
    );
    setEditableLineupSlots(Array.isArray(matchSquad.lineup_slots) ? matchSquad.lineup_slots : []);
    setSquadChanged(false);
  }, [matchSquad?.event_id, matchSquad?.updated_at]);

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
          <button onClick={() => navigate(`/events/${eventId}`)} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
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
        <Link to={`/events/${eventId}`} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
          <ArrowLeft className="w-6 h-6" />
        </Link>
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
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Kader festlegen</p>
                  {squadCandidatePlayers.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {squadCandidatePlayers.map((player) => {
                        const checked = editableSquadUserIds.includes(player.id);
                        return (
                          <label key={player.id} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2">
                            <input type="checkbox" checked={checked} onChange={(event) => toggleSquadPlayer(player.id, event.target.checked)} className="h-4 w-4" />
                            <span className="inline-flex items-center gap-2 min-w-0">
                              {renderAvatar(player.name, player.profile_picture, 'w-7 h-7')}
                              <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{player.name}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-300">Noch keine Teilnehmer vorhanden.</p>
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
