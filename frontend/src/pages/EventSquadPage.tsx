import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, ClipboardList, Swords } from 'lucide-react';
import { eventsAPI, teamsAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../lib/useToast';
import { resolveAssetUrl } from '../lib/utils';

const MATCH_LINEUP_SLOT_ORDER = ['TW', 'LV', 'IV1', 'IV2', 'RV', 'DM', 'ZM', 'OM', 'LF', 'ST', 'RF'];
const MAX_BOARD_PLAYERS = 11;
const MAX_BENCH_PLAYERS = 5;

const DEFAULT_BOARD_POSITIONS: Array<{ x_pct: number; y_pct: number }> = [
  { x_pct: 50, y_pct: 88 },
  { x_pct: 12, y_pct: 72 },
  { x_pct: 36, y_pct: 72 },
  { x_pct: 64, y_pct: 72 },
  { x_pct: 88, y_pct: 72 },
  { x_pct: 50, y_pct: 56 },
  { x_pct: 28, y_pct: 42 },
  { x_pct: 72, y_pct: 42 },
  { x_pct: 12, y_pct: 26 },
  { x_pct: 50, y_pct: 22 },
  { x_pct: 88, y_pct: 26 },
];

type SquadPlayer = {
  id: number;
  name: string;
  profile_picture?: string;
  jersey_number?: number | null;
  response_status?: 'accepted' | 'declined' | 'tentative' | 'pending';
};

type EditableLineupSlot = {
  slot: string;
  user_id: number | null;
  x_pct?: number | null;
  y_pct?: number | null;
};

export default function EventSquadPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id || '', 10);
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const locationStateFrom = typeof (location.state as any)?.from === 'string'
    ? (location.state as any).from
    : '';
  const originFrom = locationStateFrom && locationStateFrom !== location.pathname
    ? locationStateFrom
    : '';

  const isTrainer = user?.role === 'trainer';

  const [editableSquadUserIds, setEditableSquadUserIds] = useState<number[]>([]);
  const [editableLineupSlots, setEditableLineupSlots] = useState<EditableLineupSlot[]>([]);
  const [squadChanged, setSquadChanged] = useState(false);
  const [draggingPlayerId, setDraggingPlayerId] = useState<number | null>(null);
  const [draggingSource, setDraggingSource] = useState<'bench' | 'board' | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x_pct: number; y_pct: number; insideBoard: boolean } | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragPositionRef = useRef<{ x_pct: number; y_pct: number; insideBoard: boolean } | null>(null);

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

  const clampPercent = (value: number, min = 6, max = 94) => Math.min(max, Math.max(min, value));

  const toBoardPercent = (clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const rawX = ((clientX - rect.left) / rect.width) * 100;
    const rawY = ((clientY - rect.top) / rect.height) * 100;
    const insideBoard = rawX >= 0 && rawX <= 100 && rawY >= 0 && rawY <= 100;

    return {
      x_pct: clampPercent(rawX),
      y_pct: clampPercent(rawY, 8, 92),
      insideBoard,
    };
  };

  useEffect(() => {
    if (!matchSquad) return;

    const onlyPlayerIds = (input: any[]) =>
      input
        .map((entry: any) => Number(entry))
        .filter((entry: number) => Number.isInteger(entry) && playerMemberIds.has(entry));

    const safeSquadUserIds = Array.isArray(matchSquad.squad_user_ids)
      ? onlyPlayerIds(matchSquad.squad_user_ids)
      : [];

    const normalizedLineupSlots: EditableLineupSlot[] = Array.isArray(matchSquad.lineup_slots)
      ? matchSquad.lineup_slots
          .map((entry: any) => {
            const slot = String(entry?.slot || '').toUpperCase();
            if (!MATCH_LINEUP_SLOT_ORDER.includes(slot)) {
              return null;
            }

            const userId = safeSquadUserIds.includes(Number(entry?.user_id)) ? Number(entry?.user_id) : null;
            const slotIndex = MATCH_LINEUP_SLOT_ORDER.indexOf(slot);
            const defaultPosition = DEFAULT_BOARD_POSITIONS[slotIndex] || { x_pct: 50, y_pct: 50 };
            const xValue = Number(entry?.x_pct);
            const yValue = Number(entry?.y_pct);

            return {
              slot,
              user_id: userId,
              x_pct: Number.isFinite(xValue) ? clampPercent(xValue) : defaultPosition.x_pct,
              y_pct: Number.isFinite(yValue) ? clampPercent(yValue, 8, 92) : defaultPosition.y_pct,
            } as EditableLineupSlot;
          })
          .filter(Boolean) as EditableLineupSlot[]
      : [];

    setEditableSquadUserIds(safeSquadUserIds);
    setEditableLineupSlots(normalizedLineupSlots);
    setSquadChanged(false);
  }, [matchSquad?.event_id, matchSquad?.updated_at, playerMemberIds.size]);

  const boardPlayers = editableLineupSlots
    .filter((entry) => entry.user_id !== null && entry.user_id !== undefined)
    .map((entry) => ({
      ...entry,
      user_id: Number(entry.user_id),
      player: squadCandidatePlayers.find((player) => player.id === Number(entry.user_id)),
    }))
    .filter((entry) => Number.isInteger(entry.user_id));

  const boardPlayerIds = new Set(boardPlayers.map((entry) => entry.user_id));

  const benchPlayers = squadCandidatePlayers.filter(
    (player) => editableSquadUserIds.includes(player.id) && !boardPlayerIds.has(player.id)
  );
  const boardPlayerCount = boardPlayers.length;
  const benchPlayerCount = benchPlayers.length;

  const acceptedPlayers = squadCandidatePlayers.filter((player) => player.response_status === 'accepted');

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
      return <img src={avatarUrl} alt={`${name} Profilbild`} className={`${sizeClass} rounded-full object-cover border border-gray-700 bg-gray-100`} />;
    }
    return <div className={`${sizeClass} rounded-full bg-gray-700`} />;
  };

  const toggleSquadPlayer = (userId: number, shouldSelect: boolean) => {
    if (!isTrainer) return;

    if (shouldSelect && !editableSquadUserIds.includes(userId) && benchPlayerCount >= MAX_BENCH_PLAYERS) {
      showToast(`Die Bank ist auf ${MAX_BENCH_PLAYERS} Spieler begrenzt.`, 'warning');
      return;
    }

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

  const getFreeSlot = (slots: EditableLineupSlot[]) => {
    const usedSlots = new Set(slots.filter((entry) => entry.user_id).map((entry) => entry.slot));
    return MATCH_LINEUP_SLOT_ORDER.find((slot) => !usedSlots.has(slot)) || null;
  };

  const placePlayerOnBoard = (playerId: number, xPct: number, yPct: number) => {
    if (!editableSquadUserIds.includes(playerId)) {
      return;
    }

    let hasChanged = false;

    setEditableLineupSlots((prev) => {
      const sanitizedX = clampPercent(xPct);
      const sanitizedY = clampPercent(yPct, 8, 92);
      const existingIndex = prev.findIndex((entry) => Number(entry.user_id) === playerId);

      if (existingIndex >= 0) {
        hasChanged = true;
        return prev.map((entry, index) => (
          index === existingIndex ? { ...entry, x_pct: sanitizedX, y_pct: sanitizedY } : entry
        ));
      }

      const nextSlot = getFreeSlot(prev);
      if (!nextSlot) {
        showToast(`Es können maximal ${MAX_BOARD_PLAYERS} Spieler auf dem Board platziert werden.`, 'warning');
        return prev;
      }

      hasChanged = true;
      return [...prev, { slot: nextSlot, user_id: playerId, x_pct: sanitizedX, y_pct: sanitizedY }];
    });

    if (hasChanged) {
      setSquadChanged(true);
    }
  };

  const movePlayerToBench = (playerId: number) => {
    if (benchPlayerCount >= MAX_BENCH_PLAYERS) {
      showToast(`Die Bank ist auf ${MAX_BENCH_PLAYERS} Spieler begrenzt.`, 'warning');
      return;
    }

    setEditableLineupSlots((prev) => {
      const targetIndex = prev.findIndex((entry) => Number(entry.user_id) === playerId);
      if (targetIndex < 0) {
        return prev;
      }

      const next = [...prev];
      next[targetIndex] = { ...next[targetIndex], user_id: null };
      setSquadChanged(true);
      return next;
    });
  };

  const startDrag = (playerId: number, source: 'bench' | 'board', event: React.PointerEvent) => {
    if (!isTrainer) return;
    if (source === 'bench' && !editableSquadUserIds.includes(playerId)) return;

    event.preventDefault();
    const nextPosition = toBoardPercent(event.clientX, event.clientY);
    setDraggingPlayerId(playerId);
    setDraggingSource(source);
    setDragPosition(nextPosition);
    dragPositionRef.current = nextPosition;
  };

  useEffect(() => {
    if (!draggingPlayerId || !draggingSource) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nextPosition = toBoardPercent(event.clientX, event.clientY);
      dragPositionRef.current = nextPosition;
      setDragPosition(nextPosition);
    };

    const handlePointerUp = () => {
      const lastDragPosition = dragPositionRef.current;

      if (lastDragPosition?.insideBoard) {
        placePlayerOnBoard(draggingPlayerId, lastDragPosition.x_pct, lastDragPosition.y_pct);
      } else if (draggingSource === 'board') {
        movePlayerToBench(draggingPlayerId);
      }

      setDraggingPlayerId(null);
      setDraggingSource(null);
      setDragPosition(null);
      dragPositionRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingPlayerId, draggingSource]);

  useEffect(() => {
    const boardElement = boardRef.current;
    if (!boardElement) return;

    const positionedElements = boardElement.querySelectorAll<HTMLElement>('[data-board-x][data-board-y]');
    positionedElements.forEach((element) => {
      const xValue = Number(element.dataset.boardX);
      const yValue = Number(element.dataset.boardY);
      if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
        return;
      }

      element.style.left = `${xValue}%`;
      element.style.top = `${yValue}%`;
    });
  }, [boardPlayers, dragPosition?.x_pct, dragPosition?.y_pct, draggingPlayerId]);

  const saveMatchSquad = async () => {
    const lineupSlots = editableLineupSlots
      .filter((entry) => MATCH_LINEUP_SLOT_ORDER.includes(String(entry.slot || '').toUpperCase()))
      .map((entry) => ({
        slot: String(entry.slot || '').toUpperCase(),
        user_id: entry.user_id === null || entry.user_id === undefined || !editableSquadUserIds.includes(Number(entry.user_id))
          ? null
          : Number(entry.user_id),
        x_pct: Number.isFinite(Number(entry.x_pct)) ? clampPercent(Number(entry.x_pct)) : null,
        y_pct: Number.isFinite(Number(entry.y_pct)) ? clampPercent(Number(entry.y_pct), 8, 92) : null,
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
    return <div className="loading-card">Kader wird geladen...</div>;
  }

  if (!event) {
    return (
      <div className="empty-state">
        <Swords className="empty-state-icon" />
        <p>Termin nicht gefunden.</p>
      </div>
    );
  }

  if (event.type !== 'match') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const target = originFrom || `/events/${eventId}`;
              navigate(target, { replace: true });
            }}
            aria-label="Zurück zum Termin"
            title="Zurück zum Termin"
            className="text-gray-300 hover:text-white"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl sm:text-3xl font-bold text-white">Kader & Aufstellung</h1>
        </div>
        <div className="card">Diese Seite ist nur für Spieltermine verfügbar.</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => {
            const target = originFrom || `/events/${eventId}`;
            navigate(target, { replace: true });
          }}
          className="text-gray-300 hover:text-white"
          aria-label="Zurück"
          title="Zurück"
        >
          <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
        <h1 className="text-lg sm:text-3xl font-bold text-white flex items-center gap-2">
          <ClipboardList className="w-5 h-5 sm:w-7 sm:h-7 text-primary-400" />
          Kader & Aufstellung
        </h1>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{event.title}</h2>
          <span className={`text-xs px-2 py-1 rounded-full border ${matchSquad?.is_released === 1 ? 'bg-green-900/30 text-green-300 border-green-700/50' : 'bg-yellow-900/30 text-yellow-300 border-yellow-700/50'}`}>
            {matchSquad?.is_released === 1 ? 'Freigegeben' : 'Entwurf'}
          </span>
        </div>
      </div>

      {isMatchSquadLoading ? (
        <div className="card">
          <p className="text-sm text-gray-300">Kader wird geladen...</p>
        </div>
      ) : canViewMatchSquad ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6">
          <div className={`${isTrainer ? 'xl:col-span-8' : 'xl:col-span-12'} card p-0 overflow-hidden`}>
            <div className="px-4 sm:px-5 py-3 bg-gray-800 border-b border-gray-700">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow-label">Taktik-Board</p>
                <span className="text-xs text-gray-300">{boardPlayerCount}/{MAX_BOARD_PLAYERS}</span>
              </div>
            </div>

            <div className="p-2 sm:p-3 lg:p-4">
              <div
                ref={boardRef}
                className="tactic-board-pitch relative h-[20rem] min-[390px]:h-[22rem] sm:h-[34rem] lg:h-[40rem] overflow-hidden"
              >
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-2 sm:inset-3 border-2 border-white/80 rounded-[14px] sm:rounded-[18px]" />
                  <div className="absolute left-2 sm:left-3 right-2 sm:right-3 top-1/2 h-[2px] -translate-y-1/2 bg-white/90" />
                  <div className="absolute left-1/2 top-1/2 h-16 w-16 sm:h-24 sm:w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80" />
                  <div className="absolute left-1/2 top-1/2 h-2 w-2 sm:h-2.5 sm:w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85" />

                  <div className="absolute left-1/2 top-2 sm:top-3 h-14 sm:h-20 w-32 sm:w-44 -translate-x-1/2 border-2 border-t-0 border-white/80" />
                  <div className="absolute left-1/2 top-2 sm:top-3 h-7 sm:h-9 w-16 sm:w-20 -translate-x-1/2 border-2 border-t-0 border-white/80" />
                  <div className="absolute left-1/2 top-[13%] h-2 w-2 sm:h-2.5 sm:w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85" />
                  <div className="absolute left-1/2 top-0.5 sm:top-1 h-1.5 sm:h-2 w-8 sm:w-12 -translate-x-1/2 rounded-b bg-white/80" />
                  <div className="absolute left-1/2 top-[17%] h-6 w-12 sm:h-8 sm:w-16 -translate-x-1/2 rounded-b-full border-2 border-t-0 border-white/75" />

                  <div className="absolute left-1/2 bottom-2 sm:bottom-3 h-14 sm:h-20 w-32 sm:w-44 -translate-x-1/2 border-2 border-b-0 border-white/80" />
                  <div className="absolute left-1/2 bottom-2 sm:bottom-3 h-7 sm:h-9 w-16 sm:w-20 -translate-x-1/2 border-2 border-b-0 border-white/80" />
                  <div className="absolute left-1/2 top-[87%] h-2 w-2 sm:h-2.5 sm:w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85" />
                  <div className="absolute left-1/2 bottom-0.5 sm:bottom-1 h-1.5 sm:h-2 w-8 sm:w-12 -translate-x-1/2 rounded-t bg-white/80" />
                  <div className="absolute left-1/2 top-[77%] h-6 w-12 sm:h-8 sm:w-16 -translate-x-1/2 rounded-t-full border-2 border-b-0 border-white/75" />

                  <div className="absolute left-2 sm:left-3 top-2 sm:top-3 h-3 w-3 sm:h-4 sm:w-4 rounded-br-full border-2 border-t-0 border-l-0 border-white/75" />
                  <div className="absolute right-2 sm:right-3 top-2 sm:top-3 h-3 w-3 sm:h-4 sm:w-4 rounded-bl-full border-2 border-t-0 border-r-0 border-white/75" />
                  <div className="absolute left-2 sm:left-3 bottom-2 sm:bottom-3 h-3 w-3 sm:h-4 sm:w-4 rounded-tr-full border-2 border-b-0 border-l-0 border-white/75" />
                  <div className="absolute right-2 sm:right-3 bottom-2 sm:bottom-3 h-3 w-3 sm:h-4 sm:w-4 rounded-tl-full border-2 border-b-0 border-r-0 border-white/75" />
                </div>

                {boardPlayers.map((entry) => {
                  const player = entry.player;
                  if (!player) return null;

                  const left = Number.isFinite(Number(entry.x_pct)) ? Number(entry.x_pct) : 50;
                  const top = Number.isFinite(Number(entry.y_pct)) ? Number(entry.y_pct) : 50;

                  return (
                    <div
                      key={entry.slot}
                      className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
                      data-board-x={left}
                      data-board-y={top}
                    >
                      <div
                        className={`rounded-full border-2 border-white/90 ring-2 ring-green-800/80 shadow-md bg-gray-900/80 p-0.5 ${isTrainer ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`}
                        onPointerDown={isTrainer ? (event) => startDrag(player.id, 'board', event) : undefined}
                        title={player.name}
                        aria-label={player.name}
                      >
                        {renderAvatar(player.name, player.profile_picture, 'w-8 h-8 min-[390px]:w-9 min-[390px]:h-9 sm:w-12 sm:h-12')}
                      </div>
                    </div>
                  );
                })}

                {isTrainer && dragPosition?.insideBoard && draggingPlayerId && (
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20"
                    data-board-x={dragPosition.x_pct}
                    data-board-y={dragPosition.y_pct}
                  >
                    <div className="rounded-full border-2 border-primary-500 ring-2 ring-primary-200 ring-primary-700 shadow-md bg-primary-900/60 p-0.5">
                      {renderAvatar(getPlayerNameById(draggingPlayerId), undefined, 'w-8 h-8 min-[390px]:w-9 min-[390px]:h-9 sm:w-12 sm:h-12')}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {isTrainer && (
              <div className="px-4 sm:px-5 py-3 border-t border-gray-700 bg-gray-800">
                <p className="eyebrow-label mb-2">Bank ({benchPlayerCount}/{MAX_BENCH_PLAYERS})</p>
                {benchPlayers.length > 0 ? (
                  <div className="-mx-1 px-1 overflow-x-auto">
                    <div className="flex sm:flex-wrap gap-2 min-w-max sm:min-w-0">
                      {benchPlayers.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          onPointerDown={(event) => startDrag(player.id, 'bench', event)}
                          className="inline-flex items-center justify-center rounded-full border border-gray-600 bg-gray-900 p-1 cursor-grab active:cursor-grabbing touch-none"
                          title={player.name}
                          aria-label={player.name}
                        >
                          {renderAvatar(player.name, player.profile_picture, 'w-8 h-8 sm:w-9 sm:h-9')}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-300">Keine Spieler auf der Bank.</p>
                )}
              </div>
            )}
          </div>

          {isTrainer && (
            <div className="xl:col-span-4 space-y-4 sm:space-y-6">
              <div className="card">
                <p className="eyebrow-label mb-2">Kader festlegen (nur Zusagen)</p>
                <div className="mb-3 flex items-center justify-between text-xs text-gray-300">
                  <span>Board: {boardPlayerCount}/{MAX_BOARD_PLAYERS}</span>
                  <span>Bank: {benchPlayerCount}/{MAX_BENCH_PLAYERS}</span>
                </div>
                {acceptedPlayers.length > 0 ? (
                  <div className="space-y-3 lg:max-h-[62vh] lg:overflow-y-auto lg:pr-1">
                    <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-3 sm:p-4">
                      <h3 className="font-semibold text-sm mb-3 flex items-center justify-between text-gray-100">
                        <span className="flex items-center">
                          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-900/40 text-green-300 border border-green-700/50">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          </span>
                          Zugesagt
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-900 text-gray-300 border border-gray-700">
                          {acceptedPlayers.length}
                        </span>
                      </h3>

                      <div className="grid grid-cols-1 gap-2.5">
                        {acceptedPlayers.map((player) => {
                          const isEnabled = editableSquadUserIds.includes(player.id);
                          return (
                            <div key={player.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${isEnabled ? 'border-primary-700 bg-primary-900/20' : 'border-gray-700 bg-gray-900'}`}>
                              <span className="inline-flex items-center gap-2 min-w-0 flex-1">
                                {renderAvatar(player.name, player.profile_picture, 'w-8 h-8')}
                                <span className="text-sm text-gray-200 truncate">{player.name}</span>
                              </span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={isEnabled}
                                aria-label={`${player.name} im Kader umschalten`}
                                onClick={() => toggleSquadPlayer(player.id, !isEnabled)}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${isEnabled ? 'bg-primary-600' : 'bg-gray-600'}`}
                              >
                                <span
                                  className={`inline-block h-5 w-5 transform rounded-full bg-gray-100 transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-3 pt-2 border-t border-gray-700">
                        <button
                          type="button"
                          onClick={() => saveMatchSquad()}
                          disabled={saveMatchSquadMutation.isPending || releaseMatchSquadMutation.isPending || !squadChanged}
                          className="btn btn-secondary w-full"
                        >
                          {saveMatchSquadMutation.isPending ? 'Speichert...' : 'Kader speichern'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-300">Aktuell gibt es keine zugesagten Spieler.</p>
                )}
              </div>

              <div className="card">
                <p className="eyebrow-label mb-3">Aktionen</p>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => releaseMatchSquad()} disabled={saveMatchSquadMutation.isPending || releaseMatchSquadMutation.isPending || editableSquadUserIds.length === 0} className="btn btn-primary w-full">
                    {releaseMatchSquadMutation.isPending ? 'Gibt frei...' : 'Kader freigeben'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <p className="text-sm text-gray-300">Der Kader wurde noch nicht freigegeben.</p>
        </div>
      )}
    </div>
  );
}
