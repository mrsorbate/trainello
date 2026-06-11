import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock } from 'lucide-react';
import { eventsAPI } from '../lib/api';

const groupEventsByMonth = (events: any[]) => {
  return events.reduce<Array<{ key: string; label: string; items: any[] }>>((groups, event) => {
    const startDate = new Date(String(event?.start_time || ''));
    if (Number.isNaN(startDate.getTime())) {
      return groups;
    }

    const key = `${startDate.getFullYear()}-${startDate.getMonth()}`;
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.items.push(event);
      return groups;
    }

    groups.push({
      key,
      label: startDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
      items: [event],
    });

    return groups;
  }, []);
};

const renderEventCard = (event: any, navigate: ReturnType<typeof useNavigate>) => {
  const startDate = new Date(String(event?.start_time || ''));
  const dateLabel = Number.isNaN(startDate.getTime())
    ? '-'
    : startDate.toLocaleDateString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      });
  const timeLabel = Number.isNaN(startDate.getTime())
    ? '-'
    : startDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  return (
    <button
      key={event.id}
      type="button"
      onClick={() => navigate(`/events/${event.id}`)}
      className="w-full text-left rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{String(event?.title || 'Termin')}</p>
      <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{String(event?.team_name || '')}</p>
      <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span>{dateLabel}</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {timeLabel} Uhr
        </span>
      </div>
    </button>
  );
};

const renderGroupedEvents = (
  groups: Array<{ key: string; label: string; items: any[] }>,
  navigate: ReturnType<typeof useNavigate>
) => (
  <div className="space-y-4">
    {groups.map((group) => (
      <div key={group.key} className="card space-y-3">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white capitalize">{group.label}</h2>
        <div className="space-y-2">
          {group.items.map((event) => renderEventCard(event, navigate))}
        </div>
      </div>
    ))}
  </div>
);

export default function MySchedulePage() {
  const navigate = useNavigate();

  const { data: upcomingEvents, isLoading: upcomingLoading, error: upcomingError } = useQuery({
    queryKey: ['my-schedule-events', 'upcoming'],
    queryFn: async () => {
      const response = await eventsAPI.getMyAll('upcoming');
      return response.data;
    },
  });

  const { data: pastEvents, isLoading: pastLoading, error: pastError } = useQuery({
    queryKey: ['my-schedule-events', 'past'],
    queryFn: async () => {
      const response = await eventsAPI.getMyAll('past');
      return response.data;
    },
  });

  const upcomingGroupedEvents = useMemo(() => groupEventsByMonth(Array.isArray(upcomingEvents) ? upcomingEvents : []), [upcomingEvents]);
  const pastGroupedEvents = useMemo(() => groupEventsByMonth(Array.isArray(pastEvents) ? pastEvents : []), [pastEvents]);

  const hasAnyEvents = upcomingGroupedEvents.length > 0 || pastGroupedEvents.length > 0;
  const isLoading = upcomingLoading || pastLoading;
  const error = upcomingError || pastError;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Calendar className="w-6 h-6 text-primary-600" />
          <span>Mein Spielplan</span>
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-1">
          Kommende und vergangene Termine aus deinen Teams.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-4">Lädt Spielplan...</div>
      ) : error ? (
        <div className="text-sm text-red-600 dark:text-red-400 py-4">Spielplan konnte nicht geladen werden.</div>
      ) : !hasAnyEvents ? (
        <div className="card text-sm text-gray-500 dark:text-gray-400">Keine Termine gefunden.</div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Künftige Termine</h2>
            {upcomingGroupedEvents.length > 0 ? (
              renderGroupedEvents(upcomingGroupedEvents, navigate)
            ) : (
              <div className="card text-sm text-gray-500 dark:text-gray-400">Keine zukünftigen Termine gefunden.</div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Vergangene Termine</h2>
            {pastGroupedEvents.length > 0 ? (
              renderGroupedEvents(pastGroupedEvents, navigate)
            ) : (
              <div className="card text-sm text-gray-500 dark:text-gray-400">Keine vergangenen Termine gefunden.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
