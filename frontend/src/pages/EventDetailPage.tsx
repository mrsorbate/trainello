import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { eventsAPI, badgeProxyUrl } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { resolveAssetUrl } from '../lib/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { ArrowLeft, Trash2, AlertCircle, Pencil, Calendar, Cone, Swords } from 'lucide-react';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const { user } = useAuthStore();
  const isTrainer = user?.role === 'trainer';
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [selectedStatus, setSelectedStatus] = useState<'accepted' | 'declined' | 'tentative'>('accepted');
  const [comment, setComment] = useState('');
  const [responseValidationMessage, setResponseValidationMessage] = useState('');
  const [responseCommentModalOpen, setResponseCommentModalOpen] = useState(false);
  const [pendingResponseStatus, setPendingResponseStatus] = useState<'declined' | 'tentative' | null>(null);
  const [pendingResponseComment, setPendingResponseComment] = useState('');
  const [expandedResponseUserId, setExpandedResponseUserId] = useState<number | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteNote, setDeleteNote] = useState('');

  const { data: event, isLoading, isError } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const response = await eventsAPI.getById(eventId);
      return response.data;
    },
  });

  const {
    data: matchSquad,
    isLoading: isMatchSquadLoading,
    isError: isMatchSquadError,
  } = useQuery({
    queryKey: ['event-match-squad', eventId],
    queryFn: async () => {
      const response = await eventsAPI.getMatchSquad(eventId);
      return response.data;
    },
    enabled: Number.isFinite(eventId) && event?.type === 'match' && !isTrainer,
  });

  const updateResponseMutation = useMutation({
    mutationFn: (data: { status: string; comment?: string }) =>
      eventsAPI.updateResponse(eventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      setComment('');
    },
  });

  // Mutation for trainer to update player response
  const updatePlayerResponseMutation = useMutation({
    mutationFn: (data: { userId: number; status: string; comment?: string }) =>
      eventsAPI.updatePlayerResponse(eventId, data.userId, { status: data.status, comment: data.comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      setExpandedResponseUserId(null);
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (deleteSeries: boolean) => eventsAPI.delete(eventId, deleteSeries, deleteNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      navigate(`/teams/${event?.team_id}/events`);
    },
  });

  const handleDeleteEvent = (deleteSeries: boolean = false) => {
    deleteEventMutation.mutate(deleteSeries);
    setDeleteModalOpen(false);
    setDeleteNote('');
  };

  const myResponse = event?.responses?.find((r: any) => r.user_id === user?.id);
  const acceptedResponses = event?.responses?.filter((r: any) => r.status === 'accepted') || [];
  const declinedResponses = event?.responses?.filter((r: any) => r.status === 'declined') || [];
  const tentativeResponses = event?.responses?.filter((r: any) => r.status === 'tentative') || [];
  const pendingResponses = event?.responses?.filter((r: any) => r.status === 'pending') || [];
  
  const isMatchEvent = event?.type === 'match';
  const isVisibilityAll = event?.visibility_all === 1 || event?.visibility_all === true;
  const canViewResponses = isTrainer || isVisibilityAll;
  const canChooseTentative = (() => {
    if (!event?.rsvp_deadline) return true;
    const deadlineDate = new Date(event.rsvp_deadline);
    if (Number.isNaN(deadlineDate.getTime())) return true;
    const tentativeCutoff = new Date(deadlineDate.getTime() - 60 * 60 * 1000);
    return new Date() < tentativeCutoff;
  })();

  const isMatchSquadReleased = matchSquad?.is_released === 1;
  const isPlayerInMatchSquad = Array.isArray(matchSquad?.squad_user_ids)
    ? matchSquad.squad_user_ids.map((entry: any) => Number(entry)).includes(Number(user?.id))
    : false;

  const playerMatchSquadStatusText = (() => {
    if (isMatchSquadLoading) return 'Kaderstatus wird geladen...';
    if (isMatchSquadError) return 'Kaderstatus konnte nicht geladen werden.';
    if (!isMatchSquadReleased) return 'Der Kader ist noch nicht freigegeben.';
    return isPlayerInMatchSquad ? 'Du bist im Kader.' : 'Du bist nicht im Kader.';
  })();

  useEffect(() => {
    if (myResponse?.status === 'declined') {
      setSelectedStatus('declined');
    } else if (myResponse?.status === 'tentative') {
      setSelectedStatus('tentative');
    } else {
      setSelectedStatus('accepted');
    }

    if (typeof myResponse?.comment === 'string') {
      setComment(myResponse.comment);
    } else {
      setComment('');
    }
  }, [myResponse?.status, myResponse?.comment]);

  const saveOwnResponse = (status: 'accepted' | 'declined' | 'tentative', nextComment: string) => {
    if (status === 'tentative' && !canChooseTentative) {
      setResponseValidationMessage('Unsicher ist nur bis 1 Stunde vor Rückmeldefrist möglich.');
      return;
    }

    if (status === 'declined' && !isTrainer && !nextComment.trim()) {
      setResponseValidationMessage('Bitte gib einen Grund für die Absage an.');
      return;
    }

    setResponseValidationMessage('');
    updateResponseMutation.mutate({
      status,
      comment: nextComment.trim() ? nextComment : undefined,
    });
  };

  const openResponseCommentModal = (status: 'declined' | 'tentative') => {
    if (status === 'declined' && isTrainer) {
      setSelectedStatus('declined');
      saveOwnResponse('declined', '');
      return;
    }

    if (status === 'tentative' && !canChooseTentative) {
      setResponseValidationMessage('Unsicher ist nur bis 1 Stunde vor Rückmeldefrist möglich.');
      return;
    }

    setResponseValidationMessage('');
    setPendingResponseStatus(status);
    setPendingResponseComment(comment || '');
    setResponseCommentModalOpen(true);
  };

  const submitResponseCommentModal = () => {
    if (!pendingResponseStatus) return;

    if (pendingResponseStatus === 'declined' && !isTrainer && !pendingResponseComment.trim()) {
      setResponseValidationMessage('Bitte gib einen Grund für die Absage an.');
      return;
    }

    setSelectedStatus(pendingResponseStatus);
    saveOwnResponse(pendingResponseStatus, pendingResponseComment);
    setResponseCommentModalOpen(false);
    setPendingResponseStatus(null);
    setPendingResponseComment('');
  };

  const handleTrainerStatusChangeFromModule = (userId: number, targetStatus: string) => {
    if (!isTrainer || updatePlayerResponseMutation.isPending) return;

    updatePlayerResponseMutation.mutate({
      userId,
      status: targetStatus,
    });
  };

  const renderTrainerStatusActions = (userId: number, currentStatus: string) => {
    if (!isTrainer || expandedResponseUserId !== userId) return null;

    const getActionClass = (status: string) => {
      const isActive = currentStatus === status;
      const base = 'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors';

      if (status === 'accepted') {
        return `${base} ${isActive ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50'}`;
      }

      if (status === 'tentative') {
        return `${base} ${isActive ? 'bg-yellow-600 text-white' : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:hover:bg-yellow-900/50'}`;
      }

      if (status === 'declined') {
        return `${base} ${isActive ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50'}`;
      }

      return `${base} ${isActive ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`;
    };

    return (
      <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => handleTrainerStatusChangeFromModule(userId, 'accepted')}
          disabled={updatePlayerResponseMutation.isPending}
          className={getActionClass('accepted')}
          title="Zugesagt"
          aria-label="Zugesagt"
        >
          ✓
        </button>
        {canChooseTentative && (
          <button
            type="button"
            onClick={() => handleTrainerStatusChangeFromModule(userId, 'tentative')}
            disabled={updatePlayerResponseMutation.isPending}
            className={getActionClass('tentative')}
            title="Vielleicht"
            aria-label="Vielleicht"
          >
            ?
          </button>
        )}
        <button
          type="button"
          onClick={() => handleTrainerStatusChangeFromModule(userId, 'declined')}
          disabled={updatePlayerResponseMutation.isPending}
          className={getActionClass('declined')}
          title="Abgesagt"
          aria-label="Abgesagt"
        >
          ✗
        </button>
        <button
          type="button"
          onClick={() => handleTrainerStatusChangeFromModule(userId, 'pending')}
          disabled={updatePlayerResponseMutation.isPending}
          className={getActionClass('pending')}
          title="Keine Rückmeldung"
          aria-label="Keine Rückmeldung"
        >
          ⏳
        </button>
      </div>
    );
  };

  const getOpponentName = () => {
    if (!event?.title) return '';
    const parts = event.title.split(' - ');
    if (parts.length === 2) {
      const trimmedTeamName = String(event?.team_name || '').trim();
      const part1 = parts[0].trim();
      const part2 = parts[1].trim();
      return part1 === trimmedTeamName ? part2 : part1;
    }
    return event.title;
  };

  const opponent = getOpponentName();
  const displayTitle = String(opponent || event?.title || '').replace(/^spiel\s+gegen\s+/i, '').trim();
  const opponentCrestUrl = badgeProxyUrl(typeof event?.opponent_crest_url === 'string' ? event.opponent_crest_url.trim() : '') || '';

  const getInitials = (name: string) => {
    return String(name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('');
  };

  const renderAvatar = (name: string, profilePicture?: string, sizeClass = 'w-8 h-8') => {
    const avatarUrl = resolveAssetUrl(profilePicture);
    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt={`${name} Profilbild`}
          className={`${sizeClass} rounded-full object-cover border border-gray-200 dark:border-gray-700 bg-white`}
          loading="lazy"
        />
      );
    }

    return (
      <div className={`${sizeClass} rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold flex items-center justify-center`}>
        {getInitials(name)}
      </div>
    );
  };

  const safeFormatDate = (value: unknown, pattern: string): string => {
    if (!value) return '—';
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return '—';
    try {
      return format(parsed, pattern, { locale: de });
    } catch {
      return '—';
    }
  };

  const normalizeLocationValue = (value: unknown): string => {
    const normalized = String(value ?? '').trim();
    if (!normalized) return '';
    const lowered = normalized.toLowerCase();
    if (lowered === 'null' || lowered === 'undefined' || lowered === '-') return '';
    return normalized;
  };

  const eventDateLabel = safeFormatDate(event?.start_time, 'PPP');
  const eventTimeRangeLabel = `${safeFormatDate(event?.start_time, 'p')} - ${safeFormatDate(event?.end_time, 'p')}`;
  const homeGoals = Number.isInteger(Number(event?.home_goals)) ? Number(event?.home_goals) : null;
  const awayGoals = Number.isInteger(Number(event?.away_goals)) ? Number(event?.away_goals) : null;
  const hasMatchResult = event?.type === 'match' && homeGoals !== null && awayGoals !== null;
  const resultToneClass =
    hasMatchResult && homeGoals !== null && awayGoals !== null
      ? homeGoals > awayGoals
        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
        : homeGoals < awayGoals
          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200';
  const locationParts = [
    normalizeLocationValue(event?.location_venue),
    normalizeLocationValue(event?.location_street),
    normalizeLocationValue(event?.location_zip_city),
  ].filter(Boolean);
  const fallbackLocation = normalizeLocationValue(event?.location);
  if (fallbackLocation && !locationParts.includes(fallbackLocation)) {
    locationParts.push(fallbackLocation);
  }
  const locationLabel = locationParts.join(', ');
  const encodedLocationQuery = locationLabel ? encodeURIComponent(locationLabel) : '';
  const googleMapsUrl = encodedLocationQuery ? `https://www.google.com/maps/search/?api=1&query=${encodedLocationQuery}` : '';
  const appleMapsUrl = encodedLocationQuery ? `https://maps.apple.com/?q=${encodedLocationQuery}` : '';
  const shouldShowAddressBlock = event?.type === 'match' || locationParts.length > 0;
  const isMatchWithoutAddress = event?.type === 'match' && locationParts.length === 0;
  const hasMeetingInfo = (event?.meeting_point && String(event.meeting_point).trim().length > 0)
    || (event?.arrival_minutes !== null && event?.arrival_minutes !== undefined);
  const locationStateFrom = typeof (location.state as any)?.from === 'string'
    ? (location.state as any).from
    : '';
  const resolvedFrom = locationStateFrom && locationStateFrom !== location.pathname
    ? locationStateFrom
    : '';

  const handleBackNavigation = () => {
    const target = resolvedFrom || (event?.team_id ? `/teams/${event.team_id}/events` : '/events');
    navigate(target, { replace: true });
  };

  const renderResponseModule = (
    title: string,
    count: number,
    toneClass: string,
    icon: string,
    responses: any[],
    currentStatus: 'accepted' | 'declined' | 'tentative' | 'pending'
  ) => {
    if (count === 0) return null;

    return (
      <div className="card">
        <h3 className={`font-semibold text-base sm:text-lg mb-3 flex items-center justify-between ${toneClass}`}>
          <span className="flex items-center">
            <span className="mr-2">{icon}</span>
            {title}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
            {count}
          </span>
        </h3>
        <div className="space-y-2">
          {responses.map((response: any) => {
            const showDeclineReason =
              isTrainer &&
              currentStatus === 'declined' &&
              typeof response.comment === 'string' &&
              response.comment.trim().length > 0;

            return (
              <div
                key={response.id}
                onClick={() => isTrainer && setExpandedResponseUserId((prev) => (prev === response.user_id ? null : response.user_id))}
                className={`w-full flex ${showDeclineReason ? 'items-start' : 'items-center'} space-x-2 sm:space-x-3 text-sm rounded-lg px-2 py-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700`}
              >
                {renderAvatar(response.user_name, response.user_profile_picture)}
                {showDeclineReason ? (
                  <div className="min-w-0 flex-1">
                    <p className="text-gray-900 dark:text-white font-medium truncate">{response.user_name}</p>
                    <p className="mt-0 text-xs text-gray-600 dark:text-gray-300 break-words">
                      Grund: {response.comment.trim()}
                    </p>
                  </div>
                ) : (
                  <span className="text-gray-900 dark:text-white font-medium truncate">{response.user_name}</span>
                )}
                {renderTrainerStatusActions(response.user_id, currentStatus)}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return <div className="text-center py-12 text-gray-600 dark:text-gray-300">Lädt...</div>;
  }

  if (isError || !event) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-start sm:items-center space-x-3 sm:space-x-4">
          <button
            onClick={() => handleBackNavigation()}
            className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            aria-label="Zurück"
            title="Zurück"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white">Termin nicht verfügbar</h1>
        </div>

        <div className="card">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Dieser Termin konnte nicht geladen werden oder existiert nicht mehr.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-start sm:items-center space-x-3 sm:space-x-4">
        <button
          type="button"
          onClick={() => handleBackNavigation()}
          className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          aria-label="Zurück"
          title="Zurück"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 sm:space-x-3">
            {event?.type === 'match' && opponentCrestUrl ? (
              <img
                src={opponentCrestUrl}
                alt={`${displayTitle || 'Gegner'} Wappen`}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-contain bg-white"
                loading="lazy"
              />
            ) : event?.type === 'training' ? (
              <Cone className="w-7 h-7 sm:w-8 sm:h-8 text-gray-700 dark:text-gray-300 shrink-0" />
            ) : event?.type === 'match' ? (
              <Swords className="w-7 h-7 sm:w-8 sm:h-8 text-gray-700 dark:text-gray-300 shrink-0" />
            ) : (
              <Calendar className="w-7 h-7 sm:w-8 sm:h-8 text-gray-700 dark:text-gray-300 shrink-0" />
            )}
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white break-words">{displayTitle || opponent || event?.title}</h1>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Event Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Termindetails</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 sm:p-4">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Datum</p>
                <p className="mt-1 font-semibold text-gray-900 dark:text-white">{eventDateLabel}</p>
              </div>

              <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 sm:p-4">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Uhrzeit</p>
                <p className="mt-1 font-semibold text-gray-900 dark:text-white">{eventTimeRangeLabel}</p>
              </div>

              {event?.type === 'match' && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 sm:p-4">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Ergebnis</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold ${resultToneClass}`}>
                      {hasMatchResult ? `${homeGoals}:${awayGoals}` : 'Noch offen'}
                    </span>
                  </div>
                </div>
              )}

              {shouldShowAddressBlock && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 sm:p-4 sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Ort</p>
                  {locationLabel ? (
                    <div className="mt-1 space-y-1">
                      <a
                        href={googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-gray-900 dark:text-white break-words underline decoration-dotted underline-offset-2 hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        {locationLabel}
                      </a>
                      <div className="flex flex-wrap gap-3 text-xs">
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:text-primary-500"
                        >
                          In Google Maps öffnen
                        </a>
                        <a
                          href={appleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:text-primary-500"
                        >
                          In Apple Karten öffnen
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 space-y-2">
                      <p className="text-sm text-gray-600 dark:text-gray-300">Keine Adresse hinterlegt</p>
                      {isTrainer && isMatchWithoutAddress && (
                        <Link
                          to={`/events/${eventId}/edit`}
                          state={{ from: resolvedFrom || location.pathname }}
                          className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Adresse ergänzen
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}

              {hasMeetingInfo && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 sm:p-4 sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Treffpunkt</p>
                  {event?.meeting_point && (
                    <p className="mt-1 font-semibold text-gray-900 dark:text-white break-words">{event.meeting_point}</p>
                  )}
                  {event?.arrival_minutes !== null && event?.arrival_minutes !== undefined && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                      {event.arrival_minutes} Minuten vor Beginn
                    </p>
                  )}
                </div>
              )}

              {event?.type === 'match' && event?.is_home_match !== undefined && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 sm:p-4">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Spielart</p>
                  <p className="mt-1 font-semibold text-gray-900 dark:text-white">{event.is_home_match ? 'Heimspiel' : 'Auswärtsspiel'}</p>
                </div>
              )}

              {event?.duration_minutes && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 sm:p-4">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Dauer</p>
                  <p className="mt-1 font-semibold text-gray-900 dark:text-white">{event.duration_minutes} Minuten</p>
                </div>
              )}

              {event?.rsvp_deadline && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 sm:p-4 sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Rückmeldefrist</p>
                  <p className="mt-1 font-semibold text-gray-900 dark:text-white">{safeFormatDate(event.rsvp_deadline, 'PPPp')}</p>
                </div>
              )}

              {event?.pitch_type && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 sm:p-4 sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Platzart</p>
                  <p className="mt-1 font-semibold text-gray-900 dark:text-white">{event.pitch_type}</p>
                </div>
              )}

              {event?.description && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3 sm:p-4 sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Beschreibung</p>
                  <p className="text-gray-700 dark:text-gray-300 break-words mt-1">{event.description}</p>
                </div>
              )}
            </div>
          </div>

          {isMatchEvent && (
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Kader & Aufstellung</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 mb-3">
                {isTrainer ? 'Kader festlegen, Aufstellung bauen und Team freigeben.' : 'Freigegebenen Kader und Aufstellung ansehen.'}
              </p>
              {isTrainer ? (
                <Link
                  to={`/events/${eventId}/squad`}
                  state={{ from: resolvedFrom || location.pathname }}
                  className="w-full btn btn-primary inline-flex items-center justify-center"
                >
                  Zur Kaderseite
                </Link>
              ) : (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-sm font-medium text-gray-800 dark:text-gray-200">
                  {playerMatchSquadStatusText}
                </div>
              )}
            </div>
          )}

          {/* Your Response */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Deine Rückmeldung</h2>
            {myResponse && myResponse.status !== 'pending' ? (
              <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">Aktuelle Antwort:</p>
                <p className="font-medium">
                  {myResponse.status === 'accepted' && '✓ Zugesagt'}
                  {myResponse.status === 'declined' && '✗ Abgesagt'}
                  {myResponse.status === 'tentative' && '? Vielleicht'}
                </p>
                {myResponse.comment && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{myResponse.comment}</p>
                )}
              </div>
            ) : null}

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatus('accepted');
                    saveOwnResponse('accepted', '');
                  }}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                    selectedStatus === 'accepted'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500 dark:hover:bg-gray-500'
                  }`}
                >
                  ✓ Zusagen
                </button>
                <button
                  type="button"
                  onClick={() => openResponseCommentModal('tentative')}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                    selectedStatus === 'tentative'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500 dark:hover:bg-gray-500'
                  }`}
                  disabled={!canChooseTentative}
                >
                  ? Unsicher
                </button>
                <button
                  type="button"
                  onClick={() => openResponseCommentModal('declined')}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors sm:col-span-1 ${
                    selectedStatus === 'declined'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500 dark:hover:bg-gray-500'
                  }`}
                >
                  ✗ Absagen
                </button>
              </div>

              {!canChooseTentative && (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Unsicher ist nur bis 1 Stunde vor Rückmeldefrist möglich.
                </p>
              )}

              {responseValidationMessage && (
                <p className="text-sm text-red-600 dark:text-red-400">{responseValidationMessage}</p>
              )}

              {updateResponseMutation.isPending && (
                <p className="text-sm text-gray-600 dark:text-gray-300">Speichert...</p>
              )}
            </div>
          </div>

        </div>

        {/* Responses Overview */}
        <div className="space-y-4">
          {canViewResponses ? (
            <>
              {renderResponseModule(
                'Zugesagt',
                acceptedResponses.length,
                'text-green-700 dark:text-green-300',
                '✓',
                acceptedResponses,
                'accepted'
              )}

              {renderResponseModule(
                'Abgesagt',
                declinedResponses.length,
                'text-red-700 dark:text-red-300',
                '✗',
                declinedResponses,
                'declined'
              )}

              {renderResponseModule(
                'Vielleicht',
                tentativeResponses.length,
                'text-yellow-700 dark:text-yellow-300',
                '?',
                tentativeResponses,
                'tentative'
              )}

              {renderResponseModule(
                'Keine Antwort',
                pendingResponses.length,
                'text-gray-700 dark:text-gray-300',
                '⏳',
                pendingResponses,
                'pending'
              )}
            </>
          ) : (
            <div className="card">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Teilnehmerliste</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">Die Teilnehmerliste ist nur fuer Trainer sichtbar.</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Button Section */}
      {isTrainer && (
        <div className="card border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 space-y-3">
          <Link
            to={`/events/${eventId}/edit`}
            state={{ from: resolvedFrom || location.pathname }}
            className="w-full btn btn-secondary flex items-center justify-center space-x-2"
          >
            <Pencil className="w-5 h-5" />
            <span>Termin bearbeiten</span>
          </Link>
          <button
            onClick={() => setDeleteModalOpen(true)}
            disabled={deleteEventMutation.isPending}
            className="w-full btn bg-red-600 text-white hover:bg-red-700 flex items-center justify-center space-x-2"
          >
            <Trash2 className="w-5 h-5" />
            <span>Termin löschen</span>
          </button>
        </div>
      )}

      {/* Delete Modal */}
      {responseCommentModalOpen && pendingResponseStatus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {pendingResponseStatus === 'declined' ? 'Grund für Absage' : 'Kommentar für Unsicher'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 mb-3">
              {pendingResponseStatus === 'declined'
                ? 'Bitte gib einen Grund an (Pflichtfeld).'
                : 'Optionaler Kommentar für den Status Unsicher.'}
            </p>

            <textarea
              value={pendingResponseComment}
              onChange={(e) => {
                setPendingResponseComment(e.target.value);
                if (responseValidationMessage && e.target.value.trim()) {
                  setResponseValidationMessage('');
                }
              }}
              className="input"
              rows={3}
              placeholder={pendingResponseStatus === 'declined' ? 'z.B. Krank' : 'z.B. Entscheidung folgt am Abend'}
            />

            {responseValidationMessage && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">{responseValidationMessage}</p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setResponseCommentModalOpen(false);
                  setPendingResponseStatus(null);
                  setPendingResponseComment('');
                  setResponseValidationMessage('');
                }}
                className="btn btn-secondary flex-1"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={submitResponseCommentModal}
                className="btn btn-primary flex-1"
                disabled={updateResponseMutation.isPending}
              >
                {updateResponseMutation.isPending ? 'Speichert...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && event?.series_id && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <div className="flex items-start space-x-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Termin löschen</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Dieser Termin ist teil einer Serie. Wie möchtest du vorgehen?
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bemerkung für Benachrichtigung (optional)</label>
              <textarea
                value={deleteNote}
                onChange={(e) => setDeleteNote(e.target.value)}
                className="input"
                rows={3}
                placeholder="z.B. Platz gesperrt wegen Wetter"
              />
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleDeleteEvent(false)}
                disabled={deleteEventMutation.isPending}
                className="w-full btn btn-secondary"
              >
                Nur diesen Termin löschen
              </button>
              <button
                onClick={() => handleDeleteEvent(true)}
                disabled={deleteEventMutation.isPending}
                className="w-full btn bg-red-600 text-white hover:bg-red-700"
              >
                Gesamte Serie löschen ({event?.series_id ? '?' : '?'})
              </button>
              <button
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteNote('');
                }}
                disabled={deleteEventMutation.isPending}
                className="w-full btn btn-secondary"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simple delete confirmation for non-series events */}
      {deleteModalOpen && !event?.series_id && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <div className="flex items-start space-x-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Termin löschen</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Termin "{event?.title}" wirklich löschen? Dies kann nicht rückgängig gemacht werden.
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bemerkung für Benachrichtigung (optional)</label>
              <textarea
                value={deleteNote}
                onChange={(e) => setDeleteNote(e.target.value)}
                className="input"
                rows={3}
                placeholder="z.B. Platz gesperrt wegen Wetter"
              />
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleDeleteEvent(false)}
                disabled={deleteEventMutation.isPending}
                className="w-full btn bg-red-600 text-white hover:bg-red-700"
              >
                Löschen
              </button>
              <button
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteNote('');
                }}
                disabled={deleteEventMutation.isPending}
                className="w-full btn btn-secondary"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
