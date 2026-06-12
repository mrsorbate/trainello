import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { eventsAPI, badgeProxyUrl } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Calendar, Plus, ArrowLeft, MapPin, Check, X, HelpCircle, Home, Plane, Cone, Swords } from 'lucide-react';
import { useSmartBack } from '../hooks/useSmartBack';

export default function EventsPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const teamId = id ? parseInt(id) : null;
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useSmartBack();
  const queryClient = useQueryClient();
  const [openQuickActionsEventId, setOpenQuickActionsEventId] = useState<number | null>(null);
  const isTrainer = user?.role === 'trainer';
  const createdSuccess = searchParams.get('created') === '1';
  const viewParam = searchParams.get('view');
  const eventView: 'upcoming' | 'past' = viewParam === 'past' ? 'past' : 'upcoming';
  const isPastView = eventView === 'past';

  const handleViewChange = (nextView: 'upcoming' | 'past') => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextView === 'past') {
      nextParams.set('view', 'past');
    } else {
      nextParams.delete('view');
    }
    nextParams.delete('created');
    setSearchParams(nextParams, { replace: true });
    setOpenQuickActionsEventId(null);
  };

  const updateResponseMutation = useMutation({
    mutationFn: (data: { eventId: number; status: string; comment?: string }) =>
      eventsAPI.updateResponse(data.eventId, { status: data.status, comment: data.comment }),
    onSuccess: () => {
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: ['events', teamId] });
      }
      queryClient.invalidateQueries({ queryKey: ['all-events'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-events'] });
    },
  });

  // Query all events or team events based on URL param
  const { data: events, isLoading } = useQuery({
    queryKey: teamId ? ['events', teamId, eventView] : ['all-events', eventView],
    queryFn: async () => {
      if (teamId) {
        const response = await eventsAPI.getAll(teamId, undefined, undefined, eventView);
        return response.data;
      } else {
        const response = await eventsAPI.getMyAll(eventView);
        return response.data;
      }
    },
  });

  const eventItems = Array.isArray(events) ? events : [];

  const eventGroups = eventItems.reduce<Array<{ key: string; label: string; items: any[] }>>((groups, event) => {
    const startDate = new Date(event.start_time);
    if (Number.isNaN(startDate.getTime())) {
      return groups;
    }

    const groupKey = `${startDate.getFullYear()}-${startDate.getMonth()}`;
    const existingGroup = groups.find((group) => group.key === groupKey);
    if (existingGroup) {
      existingGroup.items.push(event);
      return groups;
    }

    groups.push({
      key: groupKey,
      label: startDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
      items: [event],
    });

    return groups;
  }, []);

  const renderEventCard = (event: any) => {
    const getActionButtonClass = (status: string) => {
      const isSelected = event.my_status === status;
      const baseClass = 'w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-50';

      if (status === 'accepted') {
        return `${baseClass} ${isSelected ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50'}`;
      } else if (status === 'declined') {
        return `${baseClass} ${isSelected ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50'}`;
      } else if (status === 'tentative') {
        return `${baseClass} ${isSelected ? 'bg-yellow-600 text-white' : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:hover:bg-yellow-900/50'}`;
      }
    };

    const locationText = ([event.location_venue, event.location_street, event.location_zip_city]
      .filter(Boolean)
      .join(', ') || event.location || '').trim();
    const encodedLocationQuery = locationText ? encodeURIComponent(locationText) : '';
    const googleMapsUrl = encodedLocationQuery ? `https://www.google.com/maps/search/?api=1&query=${encodedLocationQuery}` : '';
    const appleMapsUrl = encodedLocationQuery ? `https://maps.apple.com/?q=${encodedLocationQuery}` : '';

    const getOpponentName = () => {
      if (!event.title) return '';
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

    const getSquadIndicator = (): 'I' | 'II' | null => {
      const title = String(event?.title || '').trim();
      const teamName = String(event?.team_name || '').trim();
      if (/^\[(?:II|2)\]\s*/i.test(title) || /^\((?:II|2)\)\s*/i.test(title) || /\bII\b/i.test(teamName)) {
        return 'II';
      }
      if (/^\[(?:I|1)\]\s*/i.test(title) || /^\((?:I|1)\)\s*/i.test(title) || /\bI\b/i.test(teamName)) {
        return 'I';
      }
      return null;
    };

    const opponent = getOpponentName();
    const displayTitle = String(opponent || event.title || '')
      .replace(/^\[(?:I{1,3}|\d+)\]\s*/i, '')
      .replace(/^\((?:I{1,3}|\d+)\)\s*/i, '')
      .replace(/^spiel\s+gegen\s+/i, '')
      .trim();
    const squadIndicator = getSquadIndicator();
    const startDate = new Date(event.start_time);
    const canChooseTentative = (() => {
      if (!event?.rsvp_deadline) return true;
      const deadlineDate = new Date(event.rsvp_deadline);
      if (Number.isNaN(deadlineDate.getTime())) return true;
      const tentativeCutoff = new Date(deadlineDate.getTime() - 60 * 60 * 1000);
      return new Date() < tentativeCutoff;
    })();
    const weekdayLabel = startDate.toLocaleDateString('de-DE', { weekday: 'short' });
    const dayLabel = String(startDate.getDate()).padStart(2, '0');
    const monthLabel = String(startDate.getMonth() + 1).padStart(2, '0');
    const dateLabel = `${dayLabel}.${monthLabel}`;
    const timeLabel = startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const opponentCrestUrl = badgeProxyUrl(typeof event?.opponent_crest_url === 'string' ? event.opponent_crest_url.trim() : '') || '';

    const arrivalMinutes = typeof event?.arrival_minutes === 'number' ? event.arrival_minutes : 0;
    let meetingTimeLabel = '';
    if (arrivalMinutes > 0) {
      const meetingDate = new Date(startDate);
      meetingDate.setMinutes(meetingDate.getMinutes() - arrivalMinutes);
      meetingTimeLabel = meetingDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }

    const matchTypeLabel = event?.type === 'match'
      ? (event.is_home_match ? 'Heimspiel' : 'Auswärtsspiel')
      : '';

    const handleEventClick = () => {
      const from = `${location.pathname}${location.search}${location.hash}`;
      navigate(`/events/${event.id}`, { state: { from } });
    };

    return (
      <div
        key={event.id}
        onClick={handleEventClick}
        className={`${locationText ? 'min-h-[136px] sm:min-h-[156px]' : 'min-h-fit'} p-3 sm:p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer bg-white border-gray-200 hover:border-primary-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-primary-600`}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-20 sm:w-24 shrink-0 flex items-center justify-center">
            <div className="flex flex-col items-center justify-center text-center">
              <p className="text-[11px] sm:text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300 leading-none">{weekdayLabel}</p>
              <p className="mt-1 text-3xl sm:text-4xl font-semibold tabular-nums text-gray-900 dark:text-gray-100 leading-none tracking-tight">{dateLabel}</p>
            </div>
          </div>

          <div className="w-px bg-gray-200 dark:bg-gray-700 shrink-0 self-stretch" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <div className="flex items-center gap-1.5 min-w-0">
                {event.type === 'match' && opponentCrestUrl ? (
                  <img
                    src={opponentCrestUrl}
                    alt={`${displayTitle || 'Gegner'} Wappen`}
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full object-contain bg-white"
                    loading="lazy"
                  />
                ) : event.type === 'training' ? (
                  <Cone className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 dark:text-gray-300 shrink-0" />
                ) : event.type === 'match' ? (
                  <Swords className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 dark:text-gray-300 shrink-0" />
                ) : (
                  <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 dark:text-gray-300 shrink-0" />
                )}
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white truncate">{displayTitle || opponent || event.title}</h3>
              </div>
              {!teamId && (squadIndicator || event.team_name) && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                    squadIndicator === 'II'
                      ? 'bg-black text-white dark:bg-black dark:text-white'
                      : squadIndicator === 'I'
                        ? 'bg-yellow-300 text-yellow-900 dark:bg-yellow-300 dark:text-yellow-900'
                        : 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200'
                  }`}
                >
                  {squadIndicator || event.team_name}
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-gray-700 dark:text-gray-200">
              <span className="text-xl sm:text-2xl font-semibold tracking-tight">{timeLabel} <span className="text-base sm:text-lg font-normal">Uhr</span></span>
            </div>

            {meetingTimeLabel && (
              <div className="mt-0.5 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                Treffpunkt: {meetingTimeLabel} Uhr
              </div>
            )}

            {matchTypeLabel && (
              <div className="mt-0.5 flex items-center gap-1.5 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                {event.is_home_match ? (
                  <Home className="w-3.5 h-3.5" />
                ) : (
                  <Plane className="w-3.5 h-3.5" />
                )}
                <span>{matchTypeLabel}</span>
              </div>
            )}

            <div className="mt-1.5 flex items-center gap-2 sm:gap-3 text-xs sm:text-sm tabular-nums whitespace-nowrap">
              <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300 font-medium">
                <Check className="w-3.5 h-3.5" />
                {event.accepted_count}
              </span>
              <span className="inline-flex items-center gap-1 text-yellow-700 dark:text-yellow-300 font-medium">
                <HelpCircle className="w-3.5 h-3.5" />
                {event.tentative_count}
              </span>
              <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300 font-medium">
                <X className="w-3.5 h-3.5" />
                {event.declined_count}
              </span>
            </div>

            {locationText && (
              <div
                className="mt-1.5 flex items-center gap-1.5 text-xs sm:text-sm text-gray-600 dark:text-gray-300"
                onClick={(e) => e.stopPropagation()}
              >
                <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <div className="min-w-0">
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate underline decoration-dotted underline-offset-2 hover:text-primary-600 dark:hover:text-primary-400 block"
                  >
                    {locationText}
                  </a>
                  <div className="flex items-center gap-2 mt-0.5">
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary-600 hover:text-primary-500"
                    >
                      Google Maps
                    </a>
                    <a
                      href={appleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary-600 hover:text-primary-500"
                    >
                      Apple Karten
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-0.5 flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isPastView) {
                    return;
                  }
                  setOpenQuickActionsEventId((prev) => (prev === event.id ? null : event.id));
                }}
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${
                  event.my_status === 'accepted'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    : event.my_status === 'declined'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    : event.my_status === 'tentative'
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                } ${
                  !isPastView && openQuickActionsEventId === event.id
                    ? 'ring-2 ring-primary-400 dark:ring-primary-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-800'
                    : ''
                }`}
                title={isPastView ? 'Status anzeigen' : 'Status anzeigen und ändern'}
                aria-label={isPastView ? 'Status anzeigen' : 'Status anzeigen und ändern'}
              >
                {event.my_status === 'accepted' ? (
                  <Check className="w-5 h-5 sm:w-6 sm:h-6" />
                ) : event.my_status === 'declined' ? (
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                ) : event.my_status === 'tentative' ? (
                  <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                ) : (
                  <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6 opacity-40" />
                )}
              </button>

              {!isPastView && openQuickActionsEventId === event.id && (
                <div className="absolute right-0 top-12 sm:right-full sm:top-1/2 sm:-translate-y-1/2 sm:mr-2 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-2 shadow-lg flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateResponseMutation.mutate({ eventId: event.id, status: 'accepted' });
                      setOpenQuickActionsEventId(null);
                    }}
                    disabled={updateResponseMutation.isPending}
                    className={getActionButtonClass('accepted')}
                    title="Zugesagt"
                    aria-label="Zugesagt"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  {canChooseTentative && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateResponseMutation.mutate({ eventId: event.id, status: 'tentative' });
                        setOpenQuickActionsEventId(null);
                      }}
                      disabled={updateResponseMutation.isPending}
                      className={getActionButtonClass('tentative')}
                      title="Unsicher"
                      aria-label="Unsicher"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const declineReason = window.prompt('Bitte Grund für die Absage eingeben:')?.trim() || '';
                      if (!declineReason) {
                        return;
                      }
                      updateResponseMutation.mutate({ eventId: event.id, status: 'declined', comment: declineReason });
                      setOpenQuickActionsEventId(null);
                    }}
                    disabled={updateResponseMutation.isPending}
                    className={getActionButtonClass('declined')}
                    title="Absagen"
                    aria-label="Absagen"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };


  if (isLoading) {
    return <div className="text-center py-12 text-gray-600 dark:text-gray-300">Lädt...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => goBack(teamId ? `/teams/${teamId}` : '/')}
            className="mt-1 sm:mt-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            aria-label="Zurück"
            title="Zurück"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3 min-w-0">
            <Calendar className="w-7 h-7 sm:w-8 sm:h-8 text-primary-600 shrink-0" />
            <span className="truncate">Terminübersicht</span>
          </h1>
        </div>

        {isTrainer && (
          <Link
            to={teamId ? `/teams/${teamId}/events/new` : '/events/new'}
            className="btn btn-primary w-full sm:w-auto flex items-center justify-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Termin erstellen</span>
          </Link>
        )}

      </div>

      {createdSuccess && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200">
          Termin wurde erfolgreich erstellt.
        </div>
      )}

      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 p-1 border border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => handleViewChange('upcoming')}
            className={`min-w-[120px] px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
              !isPastView
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
            }`}
          >
            Anstehend
          </button>
          <button
            type="button"
            onClick={() => handleViewChange('past')}
            className={`min-w-[120px] px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
              isPastView
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
            }`}
          >
            Vergangen
          </button>
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-3 sm:space-y-4">
        {eventGroups.map((group) => (
          <div key={group.key} className="space-y-2">
            <h2 className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-300 capitalize px-1">
              {group.label}
            </h2>
            <div className="space-y-3 sm:space-y-4">
              {group.items.map(renderEventCard)}
            </div>
          </div>
        ))}
        {eventItems.length === 0 && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Calendar className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <p className="text-lg font-medium text-gray-900 dark:text-white">{isPastView ? 'Keine vergangenen Termine' : 'Noch keine Termine'}</p>
            <p className="text-sm mt-2">
              {isPastView ? (
                'Es wurden noch keine vergangenen Termine gefunden.'
              ) : (
                teamId ? (
                  isTrainer ? 'Erstelle den ersten Termin!' : 'Warte auf Termine vom Trainer.'
                ) : (
                  'Keine zukünftigen Termine anstehend.'
                )
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
