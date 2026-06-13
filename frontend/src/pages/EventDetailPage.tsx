import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { eventsAPI, badgeProxyUrl } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { resolveAssetUrl } from '../lib/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { ArrowLeft, Trash2, AlertCircle, Pencil, Calendar, Cone, Swords, Check, X, HelpCircle, Clock, Users, Loader2 } from 'lucide-react';
import AccessibleModal from '../components/AccessibleModal';

interface EventResponse {
  id: number;
  user_id: number;
  user_name: string;
  user_profile_picture?: string | null;
  comment?: string | null;
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const { user } = useAuthStore();
  const isTrainer = user?.role === 'trainer';
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [selectedStatus, setSelectedStatus] = useState<'accepted' | 'declined' | 'tentative'>('accepted');
  const [responseValidationMessage, setResponseValidationMessage] = useState('');
  const [inlinePanel, setInlinePanel] = useState<'declined' | 'tentative' | null>(null);
  const [inlineComment, setInlineComment] = useState('');
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

  }, [myResponse?.status]);

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

  const openInlinePanel = (status: 'declined' | 'tentative') => {
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
    setInlineComment(myResponse?.status === status ? (myResponse?.comment || '') : '');
    setInlinePanel(prev => (prev === status ? null : status));
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
        return `${base} ${isActive ? 'bg-green-600 text-white' : 'bg-green-900/30 text-green-400 hover:bg-green-900/50'}`;
      }

      if (status === 'tentative') {
        return `${base} ${isActive ? 'bg-yellow-600 text-white' : 'bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50'}`;
      }

      if (status === 'declined') {
        return `${base} ${isActive ? 'bg-red-600 text-white' : 'bg-red-900/30 text-red-400 hover:bg-red-900/50'}`;
      }

      return `${base} ${isActive ? 'bg-gray-600 text-white' : 'bg-gray-700/60 text-gray-400 hover:bg-gray-700'}`;
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
          <Check className="w-3.5 h-3.5" />
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
            <HelpCircle className="w-3.5 h-3.5" />
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
          <X className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => handleTrainerStatusChangeFromModule(userId, 'pending')}
          disabled={updatePlayerResponseMutation.isPending}
          className={getActionClass('pending')}
          title="Keine Rückmeldung"
          aria-label="Keine Rückmeldung"
        >
          <Clock className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  const getOpponentName = () => {
    if (!event?.title) return '';
    const parts = event.title.split(' - ');
    if (parts.length === 2) {
      const part1 = parts[0].trim();
      const part2 = parts[1].trim();
      if (event?.type === 'match') {
        const isHomeMatch = event?.is_home_match === true || event?.is_home_match === 1 || event?.is_home_match === '1';
        const isAwayMatch = event?.is_home_match === false || event?.is_home_match === 0 || event?.is_home_match === '0';
        if (isHomeMatch || isAwayMatch) {
          return isHomeMatch ? part2 : part1;
        }
      }
      return part1;
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
          className={`${sizeClass} rounded-full object-cover border border-gray-700 bg-gray-800`}
          loading="lazy"
        />
      );
    }

    return (
      <div className={`${sizeClass} rounded-full bg-gray-700 text-gray-200 text-xs font-semibold flex items-center justify-center`}>
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

  const renderResponseModuleIcon = (iconKey: string, className: string) => {
    if (iconKey === 'check') return <Check className={className} />;
    if (iconKey === 'x') return <X className={className} />;
    if (iconKey === 'help') return <HelpCircle className={className} />;
    return <Clock className={className} />;
  };

  const renderResponseModule = (
    title: string,
    count: number,
    toneClass: string,
    icon: string,
    responses: EventResponse[],
    currentStatus: 'accepted' | 'declined' | 'tentative' | 'pending'
  ) => {
    if (count === 0) return null;

    return (
      <div className="card">
        <h3 className={`font-heading font-semibold text-base sm:text-lg mb-3 flex items-center justify-between ${toneClass}`}>
          <span className="flex items-center gap-2">
            {renderResponseModuleIcon(icon, 'w-4 h-4')}
            {title}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
            {count}
          </span>
        </h3>
        <div className="space-y-2">
          {responses.map((response) => {
            const declineComment = typeof response.comment === 'string' ? response.comment.trim() : '';
            const showDeclineReason =
              isTrainer &&
              currentStatus === 'declined' &&
              declineComment.length > 0;

            return (
	              <div
	                key={response.id}
	                onClick={() => isTrainer && setExpandedResponseUserId((prev) => (prev === response.user_id ? null : response.user_id))}
	                onKeyDown={(keyboardEvent) => {
	                  if (!isTrainer) return;
	                  if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
	                    keyboardEvent.preventDefault();
	                    setExpandedResponseUserId((prev) => (prev === response.user_id ? null : response.user_id));
	                  }
	                }}
	                role={isTrainer ? 'button' : undefined}
	                tabIndex={isTrainer ? 0 : undefined}
	                aria-expanded={isTrainer ? expandedResponseUserId === response.user_id : undefined}
	                aria-label={isTrainer ? `${response.user_name} Optionen anzeigen` : undefined}
	                className={`w-full flex ${showDeclineReason ? 'items-start' : 'items-center'} space-x-2 sm:space-x-3 text-sm rounded-lg px-2 py-2 transition-colors hover:bg-gray-700`}
	              >
                {renderAvatar(response.user_name, response.user_profile_picture ?? undefined)}
                {showDeclineReason ? (
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-medium truncate">{response.user_name}</p>
                    <p className="mt-0 text-xs text-gray-300 break-words">
                      Grund: {declineComment}
                    </p>
                  </div>
                ) : (
                  <span className="text-white font-medium truncate">{response.user_name}</span>
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
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="skeleton w-6 h-6 rounded-full" />
          <div className="skeleton h-8 w-48" />
        </div>
        <div className="skeleton h-64 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-start sm:items-center space-x-3 sm:space-x-4">
          <button
            onClick={() => handleBackNavigation()}
            className="text-gray-300 hover:text-white"
            aria-label="Zurück"
            title="Zurück"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl sm:text-3xl font-bold text-white">Termin nicht verfügbar</h1>
        </div>

        <div className="card">
          <p className="text-sm text-gray-300">
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
          className="text-gray-300 hover:text-white"
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
                className="w-7 h-7 sm:w-8 sm:h-8 crest-badge"
                loading="lazy"
              />
            ) : event?.type === 'training' ? (
              <Cone className="w-7 h-7 sm:w-8 sm:h-8 text-blue-400 shrink-0" />
            ) : event?.type === 'match' ? (
              <Swords className="w-7 h-7 sm:w-8 sm:h-8 text-primary-400 shrink-0" />
            ) : (
              <Calendar className="w-7 h-7 sm:w-8 sm:h-8 text-gray-400 shrink-0" />
            )}
            <h1 className="text-2xl sm:text-4xl font-heading font-bold text-white tracking-wide break-words">{displayTitle || opponent || event?.title}</h1>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Event Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h2 className="section-heading mb-4">
              <Calendar className="w-5 h-5 text-primary-400" />
              Termindetails
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="rounded-xl bg-gray-900/60 border border-gray-700/40 p-3 sm:p-4">
                <p className="eyebrow-label">Datum</p>
                <p className="mt-1 font-semibold text-white">{eventDateLabel}</p>
              </div>

              <div className="rounded-xl bg-gray-900/60 border border-gray-700/40 p-3 sm:p-4">
                <p className="eyebrow-label">Uhrzeit</p>
                <p className="mt-1 font-semibold text-white">{eventTimeRangeLabel}</p>
              </div>

              {shouldShowAddressBlock && (
                <div className="rounded-xl bg-gray-900/60 border border-gray-700/40 p-3 sm:p-4 sm:col-span-2">
                  <p className="eyebrow-label">Ort</p>
                  {locationLabel ? (
                    <div className="mt-1 space-y-1">
                      <a
                        href={googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-white break-words underline decoration-dotted underline-offset-2 hover:text-primary-400"
                      >
                        {locationLabel}
                      </a>
                      <div className="flex flex-wrap gap-3 text-xs">
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-400 hover:text-primary-300"
                        >
                          In Google Maps öffnen
                        </a>
                        <a
                          href={appleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-400 hover:text-primary-300"
                        >
                          In Apple Karten öffnen
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 space-y-2">
                      <p className="text-sm text-gray-400">Keine Adresse hinterlegt</p>
                      {isTrainer && isMatchWithoutAddress && (
                        <Link
                          to={`/events/${eventId}/edit`}
                          state={{ from: resolvedFrom || location.pathname }}
                          className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium border border-gray-600 text-gray-200 hover:bg-gray-700"
                        >
                          Adresse ergänzen
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}

              {hasMeetingInfo && (
                <div className="rounded-xl bg-gray-900/60 border border-gray-700/40 p-3 sm:p-4 sm:col-span-2">
                  <p className="eyebrow-label">Treffpunkt</p>
                  {event?.meeting_point && (
                    <p className="mt-1 font-semibold text-white break-words">{event.meeting_point}</p>
                  )}
                  {event?.arrival_minutes !== null && event?.arrival_minutes !== undefined && (
                    <p className="text-sm text-gray-400 mt-0.5">
                      {event.arrival_minutes} Minuten vor Beginn
                    </p>
                  )}
                </div>
              )}

              {event?.type === 'match' && event?.is_home_match !== undefined && (
                <div className="rounded-xl bg-gray-900/60 border border-gray-700/40 p-3 sm:p-4">
                  <p className="eyebrow-label">Spielart</p>
                  <p className="mt-1 font-semibold text-white">{event.is_home_match ? 'Heimspiel' : 'Auswärtsspiel'}</p>
                </div>
              )}

              {event?.duration_minutes && (
                <div className="rounded-xl bg-gray-900/60 border border-gray-700/40 p-3 sm:p-4">
                  <p className="eyebrow-label">Dauer</p>
                  <p className="mt-1 font-semibold text-white">{event.duration_minutes} Minuten</p>
                </div>
              )}

              {event?.rsvp_deadline && (
                <div className="rounded-xl bg-gray-900/60 border border-gray-700/40 p-3 sm:p-4 sm:col-span-2">
                  <p className="eyebrow-label">Rückmeldefrist</p>
                  <p className="mt-1 font-semibold text-white">{safeFormatDate(event.rsvp_deadline, 'PPPp')}</p>
                </div>
              )}

              {event?.pitch_type && (
                <div className="rounded-xl bg-gray-900/60 border border-gray-700/40 p-3 sm:p-4 sm:col-span-2">
                  <p className="eyebrow-label">Platzart</p>
                  <p className="mt-1 font-semibold text-white">{event.pitch_type}</p>
                </div>
              )}

              {event?.description && (
                <div className="rounded-xl bg-gray-900/60 border border-gray-700/40 p-3 sm:p-4 sm:col-span-2">
                  <p className="eyebrow-label">Beschreibung</p>
                  <p className="text-gray-300 break-words mt-1">{event.description}</p>
                </div>
              )}
            </div>
          </div>

          {isMatchEvent && (
            <div className="card">
              <h2 className="section-heading">
                <Swords className="w-5 h-5 text-primary-400" />
                Kader & Aufstellung
              </h2>
              <p className="text-sm text-gray-400 mt-1 mb-3">
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
                <div className="rounded-lg bg-gray-700/40 p-3 text-sm font-medium text-gray-200">
                  {playerMatchSquadStatusText}
                </div>
              )}
            </div>
          )}

          {/* Your Response */}
          <div className="card">
            <h2 className="section-heading mb-3">
              <Users className="w-5 h-5 text-primary-400" />
              Deine Rückmeldung
            </h2>

            {event?.rsvp_deadline && (() => {
              const deadline = new Date(event.rsvp_deadline);
              const now = new Date();
              const diffMs = deadline.getTime() - now.getTime();
              if (diffMs <= 0) {
                return (
                  <div className="mb-3 flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    Rückmeldefrist abgelaufen
                  </div>
                );
              }
              const diffH = Math.floor(diffMs / (1000 * 60 * 60));
              const diffM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
              const isUrgent = diffH < 3;
              return (
                <div className={`mb-3 flex items-center gap-1.5 text-xs ${isUrgent ? 'text-yellow-400' : 'text-gray-400'}`}>
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  {diffH > 0 ? `Noch ${diffH}h ${diffM}min bis Frist` : `Noch ${diffM} Minuten bis Frist`}
                </div>
              );
            })()}

            {myResponse && myResponse.status !== 'pending' && (
              <div className="mb-4 flex items-start gap-3 p-3 rounded-xl bg-gray-700/40 border border-gray-600/40">
                {myResponse.status === 'accepted' && <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />}
                {myResponse.status === 'declined' && <X className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />}
                {myResponse.status === 'tentative' && <HelpCircle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 mb-0.5">Aktuelle Antwort</p>
                  <p className="text-sm font-semibold">
                    {myResponse.status === 'accepted' && <span className="text-green-400">Zugesagt</span>}
                    {myResponse.status === 'declined' && <span className="text-red-400">Abgesagt</span>}
                    {myResponse.status === 'tentative' && <span className="text-yellow-400">Unsicher</span>}
                  </p>
                  {myResponse.comment && (
                    <p className="text-xs text-gray-400 mt-1 break-words">{myResponse.comment}</p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {/* Zusagen */}
              <button
                type="button"
                onClick={() => {
                  setInlinePanel(null);
                  setResponseValidationMessage('');
                  setSelectedStatus('accepted');
                  saveOwnResponse('accepted', '');
                }}
                disabled={updateResponseMutation.isPending}
                className={`w-full flex items-center justify-center gap-2 rounded-xl font-heading font-semibold text-base tracking-wide transition-all duration-200 ${
                  selectedStatus === 'accepted'
                    ? 'bg-green-600 text-white shadow-glow-green ring-2 ring-green-500/40'
                    : 'bg-green-900/30 text-green-300 border border-green-700/50 hover:bg-green-800/50'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                style={{ minHeight: '52px' }}
              >
                {updateResponseMutation.isPending && selectedStatus === 'accepted'
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <Check className="w-5 h-5" />}
                Zusagen
              </button>

              {/* Unsicher */}
              <button
                type="button"
                onClick={() => openInlinePanel('tentative')}
                disabled={!canChooseTentative || updateResponseMutation.isPending}
                className={`w-full flex items-center justify-center gap-2 rounded-xl font-heading font-semibold text-base tracking-wide transition-all duration-200 ${
                  selectedStatus === 'tentative'
                    ? 'bg-yellow-600 text-white ring-2 ring-yellow-500/40'
                    : inlinePanel === 'tentative'
                    ? 'bg-yellow-900/40 text-yellow-300 border border-yellow-600/60'
                    : 'bg-yellow-900/30 text-yellow-300 border border-yellow-700/50 hover:bg-yellow-900/40'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
                style={{ minHeight: '52px' }}
              >
                <HelpCircle className="w-5 h-5" />
                Unsicher
              </button>

              {/* Inline panel — Unsicher */}
              {inlinePanel === 'tentative' && (
                <div className="rounded-xl border border-yellow-700/40 bg-yellow-900/10 p-3 animate-slide-down">
                  <label htmlFor="rsvp-tentative-comment" className="block text-xs font-heading font-semibold text-yellow-400 mb-2 uppercase tracking-wide">
                    Kommentar <span className="text-gray-500 font-normal normal-case tracking-normal">(optional)</span>
                  </label>
                  <textarea
                    id="rsvp-tentative-comment"
                    value={inlineComment}
                    onChange={(e) => setInlineComment(e.target.value)}
                    className="input text-sm"
                    rows={2}
                    placeholder="z.B. Entscheidung folgt am Abend"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStatus('tentative');
                        saveOwnResponse('tentative', inlineComment);
                        setInlinePanel(null);
                      }}
                      disabled={updateResponseMutation.isPending}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl font-heading font-semibold text-sm bg-yellow-600 text-white hover:bg-yellow-500 transition-colors disabled:opacity-50"
                      style={{ minHeight: '44px' }}
                    >
                      {updateResponseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Bestätigen
                    </button>
                    <button
                      type="button"
                      onClick={() => { setInlinePanel(null); setInlineComment(''); }}
                      className="btn btn-ghost"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}

              {/* Absagen */}
              <button
                type="button"
                onClick={() => openInlinePanel('declined')}
                disabled={updateResponseMutation.isPending}
                className={`w-full flex items-center justify-center gap-2 rounded-xl font-heading font-semibold text-base tracking-wide transition-all duration-200 ${
                  selectedStatus === 'declined'
                    ? 'bg-red-600 text-white shadow-glow-primary ring-2 ring-red-500/40'
                    : inlinePanel === 'declined'
                    ? 'bg-red-900/40 text-red-300 border border-red-600/60'
                    : 'bg-red-900/30 text-red-300 border border-red-700/50 hover:bg-red-900/40'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                style={{ minHeight: '52px' }}
              >
                {updateResponseMutation.isPending && selectedStatus === 'declined'
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <X className="w-5 h-5" />}
                Absagen
              </button>

              {/* Inline panel — Absagen */}
              {inlinePanel === 'declined' && (
                <div className="rounded-xl border border-red-700/40 bg-red-900/10 p-3 animate-slide-down">
                  <label htmlFor="rsvp-decline-reason" className="block text-xs font-heading font-semibold text-red-400 mb-2 uppercase tracking-wide">
                    Grund <span className="text-gray-500 font-normal normal-case tracking-normal">(Pflichtfeld)</span>
                  </label>
                  <textarea
                    id="rsvp-decline-reason"
                    value={inlineComment}
                    onChange={(e) => {
                      setInlineComment(e.target.value);
                      if (responseValidationMessage && e.target.value.trim()) {
                        setResponseValidationMessage('');
                      }
                    }}
                    className="input text-sm"
                    rows={2}
                    placeholder="z.B. Krank, Urlaub, Arbeit…"
                  />
                  {responseValidationMessage && (
                    <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {responseValidationMessage}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!inlineComment.trim()) {
                          setResponseValidationMessage('Bitte gib einen Grund für die Absage an.');
                          return;
                        }
                        setSelectedStatus('declined');
                        saveOwnResponse('declined', inlineComment);
                        setInlinePanel(null);
                      }}
                      disabled={updateResponseMutation.isPending}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl font-heading font-semibold text-sm bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                      style={{ minHeight: '44px' }}
                    >
                      {updateResponseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Absage bestätigen
                    </button>
                    <button
                      type="button"
                      onClick={() => { setInlinePanel(null); setInlineComment(''); setResponseValidationMessage(''); }}
                      className="btn btn-ghost"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}

              {!canChooseTentative && !inlinePanel && (
                <p className="text-xs text-gray-400 flex items-center gap-1.5 pt-1">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  Unsicher ist nur bis 1 Stunde vor Rückmeldefrist möglich.
                </p>
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
                'text-green-400',
                'check',
                acceptedResponses,
                'accepted'
              )}

              {renderResponseModule(
                'Abgesagt',
                declinedResponses.length,
                'text-red-400',
                'x',
                declinedResponses,
                'declined'
              )}

              {renderResponseModule(
                'Vielleicht',
                tentativeResponses.length,
                'text-yellow-400',
                'help',
                tentativeResponses,
                'tentative'
              )}

              {renderResponseModule(
                'Keine Antwort',
                pendingResponses.length,
                'text-gray-400',
                'clock',
                pendingResponses,
                'pending'
              )}
            </>
          ) : (
            <div className="card">
              <h3 className="font-semibold text-white mb-2">Teilnehmerliste</h3>
              <p className="text-sm text-gray-400">Die Teilnehmerliste ist nur für Trainer sichtbar.</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Button Section */}
      {isTrainer && (
        <div className="card border-red-900/60 bg-red-900/10 space-y-3">
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

	      {deleteModalOpen && event?.series_id && (
	        <AccessibleModal
	          labelledBy="delete-series-event-title"
	          onClose={() => {
	            setDeleteModalOpen(false);
	            setDeleteNote('');
	          }}
	          panelClassName="card max-w-md w-full mx-4"
	        >
	            <div className="flex items-start space-x-3 mb-4">
	              <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
	              <div>
	                <h3 id="delete-series-event-title" className="text-lg font-semibold text-white">Termin löschen</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Dieser Termin ist teil einer Serie. Wie möchtest du vorgehen?
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="delete-series-note" className="block text-sm font-medium text-gray-300 mb-1">Bemerkung für Benachrichtigung (optional)</label>
              <textarea
                id="delete-series-note"
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
                Gesamte Serie löschen ({event?.series_count != null ? `${event.series_count} Termine` : '?'})
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
	        </AccessibleModal>
	      )}

      {/* Simple delete confirmation for non-series events */}
	      {deleteModalOpen && !event?.series_id && (
	        <AccessibleModal
	          labelledBy="delete-event-title"
	          onClose={() => {
	            setDeleteModalOpen(false);
	            setDeleteNote('');
	          }}
	          panelClassName="card max-w-md w-full mx-4"
	        >
	            <div className="flex items-start space-x-3 mb-4">
	              <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
	              <div>
	                <h3 id="delete-event-title" className="text-lg font-semibold text-white">Termin löschen</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Termin "{event?.title}" wirklich löschen? Dies kann nicht rückgängig gemacht werden.
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="delete-event-note" className="block text-sm font-medium text-gray-300 mb-1">Bemerkung für Benachrichtigung (optional)</label>
              <textarea
                id="delete-event-note"
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
	        </AccessibleModal>
	      )}
    </div>
  );
}
