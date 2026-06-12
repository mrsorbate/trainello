import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Swords, Home, Plane } from 'lucide-react';
import { teamsAPI } from '../lib/api';

const normalizeTeamName = (value: unknown): string => {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
};

const parseMatchDate = (input: unknown): Date | null => {
  const raw = String(input || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  const germanMatch = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[^0-9]*(\d{1,2}):(\d{2}))?/);
  if (germanMatch) {
    const day = parseInt(germanMatch[1], 10);
    const month = parseInt(germanMatch[2], 10) - 1;
    const year = parseInt(germanMatch[3], 10);
    const hours = germanMatch[4] ? parseInt(germanMatch[4], 10) : 19;
    const minutes = germanMatch[5] ? parseInt(germanMatch[5], 10) : 0;
    const date = new Date(year, month, day, hours, minutes, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const isoDate = new Date(raw);
  return Number.isNaN(isoDate.getTime()) ? null : isoDate;
};

const renderMatchCard = (match: any, section: any, cardKey: string) => {
  const parsed = parseMatchDate(match?.date);

  let weekdayLabel = '';
  let dateLabel = '';
  let timeLabel = '';

  if (parsed) {
    weekdayLabel = parsed.toLocaleDateString('de-DE', { weekday: 'short' });
    const dayLabel = String(parsed.getDate()).padStart(2, '0');
    const monthLabel = String(parsed.getMonth() + 1).padStart(2, '0');
    dateLabel = `${dayLabel}.${monthLabel}`;
    timeLabel = parsed.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  } else {
    // Fallback wenn Datum nicht geparst werden kann
    const raw = String(match?.date || '-').split('|')[0]?.trim() || '-';
    dateLabel = raw;
    const rawTime = String(match?.date || '');
    const timeMatch = rawTime.match(/(\d{1,2}):(\d{2})/);
    timeLabel = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : '-';
  }

  const homeTeam = String(match?.homeTeam || '-');
  const awayTeam = String(match?.awayTeam || '-');
  
  // Wappen direkt ohne badgeProxyUrl verwenden
  const homeBadge = typeof match?.homeBadge === 'string' ? match.homeBadge.trim() : '';
  const awayBadge = typeof match?.awayBadge === 'string' ? match.awayBadge.trim() : '';

  const isOurTeam = (teamName: string, sectionTeamName: string) => {
    return normalizeTeamName(teamName) === normalizeTeamName(sectionTeamName);
  };

  const isHomeMatch = isOurTeam(homeTeam, section.teamName);
  const opponent = isHomeMatch ? awayTeam : homeTeam;
  const opponentBadge = isHomeMatch ? awayBadge : homeBadge;

  return (
    <div
      key={cardKey}
      className="p-3 sm:p-4 rounded-xl border transition-all hover:shadow-md bg-white border-gray-200 hover:border-primary-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-primary-600"
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="w-16 sm:w-20 shrink-0 flex items-center justify-center">
          <div className="flex flex-col items-center justify-center text-center">
            {weekdayLabel && (
              <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300 leading-none">{weekdayLabel}</p>
            )}
            <p className="mt-0.5 text-2xl sm:text-3xl font-semibold tabular-nums text-gray-900 dark:text-gray-100 leading-none tracking-tight">{dateLabel}</p>
          </div>
        </div>

        <div className="w-px bg-gray-200 dark:bg-gray-700 shrink-0 self-stretch" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0">
              {opponentBadge ? (
                <img
                  src={opponentBadge}
                  alt={`${opponent} Wappen`}
                  className="w-4 h-4 sm:w-5 sm:h-5 rounded-full object-contain bg-white flex-shrink-0"
                  loading="lazy"
                />
              ) : (
                <Swords className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 dark:text-gray-300 shrink-0" />
              )}
              <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate">{opponent}</h3>
            </div>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-gray-700 dark:text-gray-200">
            <span className="text-sm sm:text-base font-semibold tracking-tight">{timeLabel} <span className="text-xs sm:text-sm font-normal">Uhr</span></span>
          </div>

          <div className="mt-0.5 flex items-center gap-1.5 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            {isHomeMatch ? (
              <Home className="w-3.5 h-3.5" />
            ) : (
              <Plane className="w-3.5 h-3.5" />
            )}
            <span>{isHomeMatch ? 'Heimspiel' : 'Auswärtsspiel'}</span>
          </div>

          {section.leagueName && (
            <div className="mt-0.5 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              {section.leagueName}
            </div>
          )}

          {section.matchedTeamName && normalizeTeamName(section.matchedTeamName) !== normalizeTeamName(section.teamName) && (
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {section.matchedTeamName}
            </div>
          )}

          {section.teamName && (
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200 whitespace-nowrap">
                {section.teamName}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const renderScheduleSections = (
  sections: any[],
  mode: 'next' | 'last'
) => {
  // Flatten alle Spiele mit ihren Team-Informationen
  const allMatches: Array<{ match: any; section: any; cardKey: string }> = [];
  
  sections.forEach((section) => {
    const matches = mode === 'next' ? section.nextGames : section.lastGames;
    if (Array.isArray(matches)) {
      matches.forEach((match: any, index: number) => {
        allMatches.push({
          match,
          section,
          cardKey: `${section.key}-${mode}-${index}`,
        });
      });
    }
  });

  if (allMatches.length === 0) return null;

  // Sortiere nach Datum
  allMatches.sort((a, b) => {
    const dateA = parseMatchDate(a.match?.date);
    const dateB = parseMatchDate(b.match?.date);
    
    if (dateA && dateB) {
      // Bei "next": aufsteigend (nächste zuerst), bei "last": absteigend (neueste zuerst)
      return mode === 'next' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
    }
    
    // Fallback bei nicht geparstem Datum
    const rawA = String(a.match?.date || '');
    const rawB = String(b.match?.date || '');
    return mode === 'next' ? rawA.localeCompare(rawB) : rawB.localeCompare(rawA);
  });

  return (
    <div className="space-y-3">
      {allMatches.map(({ match, section, cardKey }) =>
        renderMatchCard(match, section, cardKey)
      )}
    </div>
  );
};

export default function MySchedulePage() {
  const { data: scheduleSections, isLoading, error } = useQuery({
    queryKey: ['my-schedule-external'],
    queryFn: async () => {
      const teamsResponse = await teamsAPI.getAll();
      const teams = Array.isArray(teamsResponse.data) ? teamsResponse.data : [];

      const schedulesPerTeam = await Promise.all(teams.map(async (team: any) => {
        try {
          const response = await teamsAPI.getExternalSchedule(Number(team.id));
          const schedules = Array.isArray(response.data?.schedules) ? response.data.schedules : [];
          return schedules.map((schedule: any, index: number) => ({
            key: `${team.id}-${String(schedule?.source_id || index)}`,
            teamId: Number(team.id),
            teamName: String(team.name || ''),
            leagueName: String(schedule?.league_name || ''),
            matchedTeamName: String(schedule?.matched_team_name || '').trim(),
            nextGames: Array.isArray(schedule?.next_games) ? schedule.next_games : [],
            lastGames: Array.isArray(schedule?.last_games) ? schedule.last_games : [],
          }));
        } catch {
          return [];
        }
      }));

      return schedulesPerTeam.flat();
    },
  });

  const sections = useMemo(() => (Array.isArray(scheduleSections) ? scheduleSections : []), [scheduleSections]);
  const hasAnyNextGames = sections.some((section) => Array.isArray(section.nextGames) && section.nextGames.length > 0);
  const hasAnyLastGames = sections.some((section) => Array.isArray(section.lastGames) && section.lastGames.length > 0);
  const hasAnyGames = hasAnyNextGames || hasAnyLastGames;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Calendar className="w-6 h-6 text-primary-600" />
          <span>Mein Spielplan</span>
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-1">
          Nächste und letzte Spiele aus deinen fussball.de Teams.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-4">Lädt Spielplan...</div>
      ) : error ? (
        <div className="text-sm text-red-600 dark:text-red-400 py-4">Spielplan konnte nicht geladen werden.</div>
      ) : !hasAnyGames ? (
        <div className="card text-sm text-gray-500 dark:text-gray-400">Keine Spiele gefunden.</div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Nächste Spiele</h2>
            {hasAnyNextGames ? (
              renderScheduleSections(sections, 'next')
            ) : (
              <div className="card text-sm text-gray-500 dark:text-gray-400">Keine nächsten Spiele gefunden.</div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Letzte Spiele</h2>
            {hasAnyLastGames ? (
              renderScheduleSections(sections, 'last')
            ) : (
              <div className="card text-sm text-gray-500 dark:text-gray-400">Keine letzten Spiele gefunden.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
