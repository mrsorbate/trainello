import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { eventsAPI, postsAPI, teamsAPI, badgeProxyUrl } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Calendar, MapPin, CheckCircle, XCircle, HelpCircle, AlertCircle, Users, RotateCw, Check, X, Home, Plane, Cone, Swords, MessageSquare } from 'lucide-react';
import { resolveAssetUrl } from '../lib/utils';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [openQuickActionsEventId, setOpenQuickActionsEventId] = useState<number | null>(null);
  const [pendingDecline, setPendingDecline] = useState<{ eventId: number; title: string } | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declineReasonError, setDeclineReasonError] = useState<string | null>(null);

  const quickDeclineReasons = [
    'Krankheit',
    'Arbeit',
    'Privater Termin',
    'Urlaub',
    'Verletzung',
  ];

  // Admin wird zum Admin-Panel weitergeleitet
  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await teamsAPI.getAll();
      return response.data;
    },
    enabled: user?.role !== 'admin',
  });

  const { data: upcomingEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ['upcoming-events'],
    queryFn: async () => {
      const response = await eventsAPI.getMyUpcoming();
      return response.data;
    },
  });

  const { data: openPosts } = useQuery({
    queryKey: ['open-posts'],
    queryFn: async () => {
      const response = await postsAPI.getOpen();
      return response.data as Array<{
        id: number;
        team_id: number;
        type: 'announcement' | 'poll';
        title: string;
        team_name: string;
      }>;
    },
    enabled: user?.role !== 'admin',
  });

  // Mutation for event response
  const updateResponseMutation = useMutation({
    mutationFn: (data: { eventId: number; status: string; comment?: string }) =>
      eventsAPI.updateResponse(data.eventId, { status: data.status, comment: data.comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upcoming-events'] });
    },
  });

  const closeDeclineModal = () => {
    if (updateResponseMutation.isPending) {
      return;
    }
    setPendingDecline(null);
    setDeclineReason('');
    setDeclineReasonError(null);
  };

  const handleDeclineSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingDecline) {
      return;
    }

    const normalizedReason = declineReason.trim();
    if (!normalizedReason) {
      setDeclineReasonError('Bitte gib einen Grund für die Absage an.');
      return;
    }

    setDeclineReasonError(null);
    updateResponseMutation.mutate(
      {
        eventId: pendingDecline.eventId,
        status: 'declined',
        comment: normalizedReason,
      },
      {
        onSuccess: () => {
          setPendingDecline(null);
          setDeclineReason('');
          setDeclineReasonError(null);
        },
        onError: (error: any) => {
          const apiMessage = String(error?.response?.data?.error || 'Absage konnte nicht gespeichert werden.');
          setDeclineReasonError(apiMessage);
        },
      }
    );
  };

  const getTeamPhotoUrl = (team: any): string | undefined => {
    return resolveAssetUrl(team.team_picture);
  };

  const teamsWithPhotos = (teams || []).filter((team: any) => Boolean(getTeamPhotoUrl(team)));
  const combinedTeamNames = (teams || []).map((team: any) => String(team?.name || '').trim()).filter(Boolean).join(' • ');
  const shouldShowTeamPhotoSection = Boolean(
    teams
    && teams.length > 0
    && (
      (teams.length === 1 && teamsWithPhotos.length === 1)
      || (teams.length > 1 && teamsWithPhotos.length >= 1)
    )
  );

  if (eventsLoading || (user?.role !== 'admin' && teamsLoading)) {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="text-center space-y-2 py-2">
          <div className="skeleton h-8 w-40 mx-auto" />
          <div className="skeleton h-4 w-56 mx-auto" />
        </div>
        <div className="card space-y-3">
          <div className="skeleton h-6 w-36" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-[88px] w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 sm:space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl sm:text-4xl font-heading font-bold text-white tracking-wide">Dashboard</h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1 break-words">Willkommen zurück, <span className="text-gray-200 font-medium">{user?.name}</span>!</p>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn btn-secondary w-full sm:w-auto"
          >
            <RotateCw className="w-4 h-4" />
            Reload
          </button>
        </div>
      </div>

      {/* Team Section - show for all non-admin users if team photos exist */}
      {user?.role !== 'admin' && shouldShowTeamPhotoSection && (
        <div className="card p-0 overflow-hidden">

          {teams.length === 1 ? (
            // Single team - full image with overlay labels
            getTeamPhotoUrl(teams[0]) && (
              <div className="relative w-full min-h-[14rem] sm:min-h-[24rem]">
                <img
                  src={getTeamPhotoUrl(teams[0])}
                  alt={teams[0].name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 px-4 text-center">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-black/55 text-white text-sm sm:text-base font-semibold backdrop-blur-sm">
                    <Users className="w-4 h-4" />
                    Mein Team
                  </span>
                  <h3 className="inline-block px-3 py-1 rounded-md bg-black/55 text-white text-base sm:text-xl font-bold backdrop-blur-sm">
                    {teams[0].name}
                  </h3>
                </div>
              </div>
            )
          ) : (
            teamsWithPhotos.length >= 2 ? (
              <div className="relative w-full min-h-[14rem] sm:min-h-[24rem]">
                <div className="absolute inset-0 flex">
                  {teamsWithPhotos.slice(0, 2).map((team: any, index: number) => (
                    <div key={team.id} className={`relative w-1/2 h-full ${index === 0 ? 'border-r border-white/30 dark:border-gray-900/40' : ''}`}>
                      <img
                        src={getTeamPhotoUrl(team)}
                        alt={team.name}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 px-4 text-center">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-black/55 text-white text-sm sm:text-base font-semibold backdrop-blur-sm">
                    <Users className="w-4 h-4" />
                    Meine Teams
                  </span>
                  <h3 className="inline-block px-3 py-1 rounded-md bg-black/55 text-white text-sm sm:text-lg font-bold backdrop-blur-sm break-words max-w-full">
                    {combinedTeamNames}
                  </h3>
                </div>
              </div>
            ) : (
              teamsWithPhotos[0] && (
                <div className="relative w-full min-h-[14rem] sm:min-h-[24rem]">
                  <img
                    src={getTeamPhotoUrl(teamsWithPhotos[0])}
                    alt={combinedTeamNames || 'Meine Teams'}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 px-4 text-center">
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-black/55 text-white text-sm sm:text-base font-semibold backdrop-blur-sm">
                      <Users className="w-4 h-4" />
                      Meine Teams
                    </span>
                    <h3 className="inline-block px-3 py-1 rounded-md bg-black/55 text-white text-sm sm:text-lg font-bold backdrop-blur-sm break-words max-w-full">
                      {combinedTeamNames}
                    </h3>
                  </div>
                </div>
              )
            )
          )}
        </div>
      )}

      {user?.role !== 'admin' && openPosts && openPosts.length > 0 && (
        <div className="card">
          <div className="mb-4 flex items-center justify-center">
            <h2 className="section-heading">
              <MessageSquare className="w-5 h-5 text-accent-400" />
              Offene Nachrichten & Umfragen
            </h2>
          </div>

          <div className="space-y-2">
            {openPosts.slice(0, 6).map((post) => (
              <Link
                key={post.id}
                to={`/teams/${post.team_id}/posts`}
                className="block rounded-lg border border-amber-200 bg-amber-50 p-3 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/20 dark:hover:bg-amber-900/30"
              >
                <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  {post.type === 'poll' ? 'Umfrage' : 'Nachricht'}
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">{post.title}</p>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{post.team_name}</p>
              </Link>
            ))}
            {openPosts.length > 6 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center pt-1">
                {openPosts.length - 6} weitere Einträge offen
              </p>
            )}
          </div>
        </div>
      )}

      {/* Upcoming Events Section */}
      <div className="card">
        <div className="mb-4 flex items-center justify-center">
          <h2 className="section-heading">
            <Calendar className="w-5 h-5 text-primary-400" />
            Terminübersicht
          </h2>
        </div>
        
        {eventsLoading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Lädt...</div>
        ) : upcomingEvents && upcomingEvents.length > 0 ? (
          <div className="space-y-3">
            {upcomingEvents.map((event: any) => {
              const startDate = new Date(event.start_time);
              const isToday = startDate.toDateString() === new Date().toDateString();
              
              const getStatusIcon = (status: string) => {
                switch (status) {
                  case 'accepted': return <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />;
                  case 'declined': return <XCircle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />;
                  case 'tentative': return <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" />;
                  default: return <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />;
                }
              };

              const getStatusCircleClass = (status: string) => {
                switch (status) {
                  case 'accepted':
                    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
                  case 'declined':
                    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
                  case 'tentative':
                    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
                  default:
                    return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
                }
              };

              const handleStatusClick = (status: string, e: React.MouseEvent) => {
                e.stopPropagation();
                if (status === 'declined' && user?.role !== 'trainer') {
                  setPendingDecline({
                    eventId: event.id,
                    title: String(displayTitle || opponent || event.title || 'Termin'),
                  });
                  setDeclineReason('');
                  setDeclineReasonError(null);
                  setOpenQuickActionsEventId(null);
                  return;
                }
                updateResponseMutation.mutate({ eventId: event.id, status });
              };

              const handleCardClick = () => {
                const from = `${location.pathname}${location.search}${location.hash}`;
                navigate(`/events/${event.id}`, { state: { from } });
              };

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

              // Extract opponent name from title
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
              const squadBadgeText = squadIndicator || event.team_name;
              const squadBadgeClass = squadIndicator === 'II'
                ? 'bg-black text-white dark:bg-black dark:text-white'
                : squadIndicator === 'I'
                  ? 'bg-yellow-300 text-yellow-900 dark:bg-yellow-300 dark:text-yellow-900'
                  : 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200';
              const weekdayLabel = startDate.toLocaleDateString('de-DE', { weekday: 'short' });
              const dayLabel = String(startDate.getDate()).padStart(2, '0');
              const monthLabel = String(startDate.getMonth() + 1).padStart(2, '0');
              const dateLabel = `${dayLabel}.${monthLabel}`;
              const timeLabel = startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
              const opponentCrestUrl = badgeProxyUrl(typeof event?.opponent_crest_url === 'string' ? event.opponent_crest_url.trim() : '') || '';
              
              // Calculate meeting time if arrival_minutes is set
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

              return (
                <div
                  key={event.id}
                  onClick={handleCardClick}
                  className={`${locationText ? 'min-h-[136px] sm:min-h-[156px]' : 'min-h-fit'} p-3 sm:p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer ${
                    isToday 
                      ? 'bg-primary-900/20 border-primary-700 dark:bg-primary-900/30 dark:border-primary-600' 
                      : 'bg-white border-gray-200 hover:border-primary-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-primary-600'
                  }`}
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
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
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
                        {squadBadgeText && (
                          <span
                            className={`inline-flex items-center justify-center min-w-7 px-2 h-7 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${squadBadgeClass}`}
                          >
                            {squadBadgeText}
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
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                          <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span className="truncate">{locationText}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-0.5 flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenQuickActionsEventId((prev) => (prev === event.id ? null : event.id));
                          }}
                          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${getStatusCircleClass(event.my_status)} ${
                            openQuickActionsEventId === event.id
                              ? 'ring-2 ring-primary-400 dark:ring-primary-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-800'
                              : ''
                          }`}
                          title="Status anzeigen und ändern"
                          aria-label="Status anzeigen und ändern"
                        >
                          {getStatusIcon(event.my_status)}
                        </button>

                        {openQuickActionsEventId === event.id && (
                          <div className="absolute right-0 top-12 sm:right-full sm:top-1/2 sm:-translate-y-1/2 sm:mr-2 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-2 shadow-lg flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                handleStatusClick('accepted', e);
                                setOpenQuickActionsEventId(null);
                              }}
                              disabled={updateResponseMutation.isPending}
                              className={getActionButtonClass('accepted')}
                              title="Zugesagt"
                              aria-label="Zugesagt"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                handleStatusClick('tentative', e);
                                setOpenQuickActionsEventId(null);
                              }}
                              disabled={updateResponseMutation.isPending}
                              className={getActionButtonClass('tentative')}
                              title="Unsicher"
                              aria-label="Unsicher"
                            >
                              <HelpCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                handleStatusClick('declined', e);
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
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Calendar className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p>Keine Termine</p>
          </div>
        )}
        <div className="mt-6 flex justify-center">
          <Link
            to="/events"
            className="btn btn-primary w-full text-center py-3 text-base"
          >
            Alle Termine
          </Link>
        </div>
      </div>

      {pendingDecline && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px] flex items-center justify-center px-4"
          onClick={closeDeclineModal}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Absagegrund</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Warum möchtest du für {pendingDecline.title} absagen?
            </p>

            <form className="mt-4 space-y-3" onSubmit={handleDeclineSubmit}>
              <div className="flex flex-wrap gap-2">
                {quickDeclineReasons.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => {
                      setDeclineReason(reason);
                      setDeclineReasonError(null);
                    }}
                    className={`px-3 py-1.5 text-xs sm:text-sm rounded-full border transition-colors ${
                      declineReason === reason
                        ? 'bg-primary-100 border-primary-400 text-primary-900 dark:bg-primary-900/40 dark:border-primary-600 dark:text-primary-100'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>

              <textarea
                value={declineReason}
                onChange={(event) => {
                  setDeclineReason(event.target.value);
                  if (declineReasonError) {
                    setDeclineReasonError(null);
                  }
                }}
                placeholder="Kurz den Grund eingeben..."
                className="input min-h-[96px]"
                autoFocus
              />

              {declineReasonError && (
                <p className="text-sm text-red-600 dark:text-red-400">{declineReasonError}</p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDeclineModal}
                  disabled={updateResponseMutation.isPending}
                  className="px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-60"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={updateResponseMutation.isPending}
                  className="px-3 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {updateResponseMutation.isPending ? 'Speichern...' : 'Absagen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
