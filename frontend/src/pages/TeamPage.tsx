import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { teamsAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Calendar, Users, BarChart, ArrowLeft, Settings } from 'lucide-react';
import { resolveAssetUrl } from '../lib/utils';
import { useSmartBack } from '../hooks/useSmartBack';

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const teamId = parseInt(id!);
  const { user } = useAuthStore();
  const goBack = useSmartBack();

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

  const { data: externalTable, isLoading: externalTableLoading, error: externalTableError } = useQuery({
    queryKey: ['team-external-table', teamId],
    queryFn: async () => {
      const response = await teamsAPI.getExternalTable(teamId);
      return response.data;
    },
    retry: false,
  });

  const externalTableRows = Array.isArray(externalTable?.table)
    ? externalTable.table
    : Array.isArray(externalTable)
      ? externalTable
      : [];
  const externalLeagueName = typeof externalTable?.leagueName === 'string' ? externalTable.leagueName : '';
  const externalSourceLabel = externalTable?.source === 'fussball.de' ? 'fussball.de' : 'Interner Fallback';
  const externalFallbackReason = String(externalTable?.diagnostics?.fallback_reason || '').trim();

  const normalizeTeamName = (name: unknown): string => {
    return String(name ?? '')
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  const ownTeamNames = [team?.fussballde_team_name, team?.name]
    .map((value) => normalizeTeamName(value))
    .filter(Boolean);

  const isOwnTeamRow = (row: any): boolean => {
    if (!ownTeamNames.length) return false;

    const rowCandidates = [
      row?.team,
      row?.name,
      row?.teamName,
      row?.team_name,
      row?.club,
      row?.clubName,
      row?.club_name,
      row?.shortName,
      row?.short_name,
    ]
      .map((value) => normalizeTeamName(value))
      .filter(Boolean);

    return rowCandidates.some((candidate) =>
      ownTeamNames.some((ownName) => {
        if (candidate === ownName) return true;
        if (candidate.length >= 6 && ownName.includes(candidate)) return true;
        if (ownName.length >= 6 && candidate.includes(ownName)) return true;
        return false;
      })
    );
  };

  const formatGoalDifference = (goalValue: unknown): string => {
    const raw = String(goalValue ?? '').trim();
    if (!raw) return '—';

    const parts = raw.split(/[:/\-]/).map((value) => parseInt(value.trim(), 10));
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      const diff = parts[0] - parts[1];
      if (diff > 0) return `+${diff}`;
      return String(diff);
    }

    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      if (parsed > 0) return `+${parsed}`;
      return String(parsed);
    }

    return '—';
  };

  const asBoolean = (value: unknown): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  };

  const getRowColorClasses = (row: any) => {
    if (asBoolean(row?.isPromotion)) {
      return 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20';
    }
    if (asBoolean(row?.isRelegation)) {
      return 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20';
    }
    if (isOwnTeamRow(row)) {
      return 'border-primary-500 dark:border-primary-400 bg-primary-100 dark:bg-primary-900/40 ring-1 ring-primary-300 dark:ring-primary-500';
    }
    return 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900';
  };

  const getDesktopRowClasses = (row: any) => {
    if (asBoolean(row?.isPromotion)) {
      return 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30';
    }
    if (asBoolean(row?.isRelegation)) {
      return 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30';
    }
    if (isOwnTeamRow(row)) {
      return 'bg-primary-100 dark:bg-primary-900/40 hover:bg-primary-200 dark:hover:bg-primary-900/50';
    }
    return 'hover:bg-gray-50 dark:hover:bg-gray-800';
  };

  const isTrainer = members?.find((m: any) => m.id === user?.id)?.role === 'trainer';

  const getTeamPhotoUrl = (): string | undefined => {
    return resolveAssetUrl(team?.team_picture);
  };

  if (teamLoading || membersLoading) {
    return <div className="text-center py-12">Lädt...</div>;
  }

  const trainers = members?.filter((m: any) => m.role === 'trainer') || [];
  const players = members?.filter((m: any) => m.role !== 'trainer') || [];

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="card">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => goBack('/')}
            className="mt-0.5 sm:mt-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            aria-label="Zurück"
            title="Zurück"
          >
            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white break-words">{team?.name}</h1>
            {team?.description && (
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-1 break-words">{team.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Team Photo */}
      {getTeamPhotoUrl() && (
        <div className="card p-0 overflow-hidden">
          <div className="relative w-full min-h-[14rem] sm:min-h-[20rem] lg:min-h-[24rem]">
            <img
              src={getTeamPhotoUrl()}
              alt={team?.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 px-4 text-center">
              <h3 className="inline-block px-3 py-1 rounded-md bg-black/55 text-white text-xl font-bold backdrop-blur-sm">
                {team?.name}
              </h3>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Link
          to={`/teams/${teamId}/events`}
          className="card hover:shadow-md transition-shadow flex items-start sm:items-center space-x-2 sm:space-x-4"
        >
          <div className="bg-primary-100 p-2.5 sm:p-3 rounded-lg">
            <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">Termine</h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 break-words">Trainings & Spiele</p>
          </div>
        </Link>

        <Link
          to={`/teams/${teamId}/kader`}
          className="card hover:shadow-md transition-shadow flex items-start sm:items-center space-x-2 sm:space-x-4 text-left"
        >
          <div className="bg-green-100 p-2.5 sm:p-3 rounded-lg">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">Trainer &amp; Spieler</h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 break-words">{trainers.length} Trainer • {players.length} Spieler</p>
          </div>
        </Link>

        <Link
          to={`/teams/${teamId}/stats`}
          className="card hover:shadow-md transition-shadow flex items-start sm:items-center space-x-2 sm:space-x-4"
        >
          <div className="bg-blue-100 p-2.5 sm:p-3 rounded-lg">
            <BarChart className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">Statistiken</h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 break-words">Anwesenheit</p>
          </div>
        </Link>

        {isTrainer && (
          <Link
            to={`/teams/${teamId}/settings`}
            className="card hover:shadow-md transition-shadow flex items-start sm:items-center space-x-2 sm:space-x-4"
          >
            <div className="bg-gray-200 dark:bg-gray-800 p-2.5 sm:p-3 rounded-lg">
              <Settings className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 dark:text-gray-100" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">Einstellungen</h3>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 break-words">Standards &amp; API</p>
            </div>
          </Link>
        )}
      </div>

      {/* Tabelle */}
      <div className="card">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Tabelle: {externalLeagueName || 'Unbekannte Liga'}
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Quelle: {externalSourceLabel}
          {externalFallbackReason ? ` (${externalFallbackReason})` : ''}
        </p>

        {externalTableLoading ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 py-4">Lädt Tabelle...</div>
        ) : externalTableRows.length ? (
          <>
            <div className="space-y-2 sm:hidden">
              {externalTableRows.map((row: any, index: number) => (
                <div
                  key={`${row.team}-mobile-${index}`}
                  className={`rounded-lg border p-3 ${getRowColorClasses(row)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white w-6">{row.place}</span>
                      {row.img ? (
                        <img
                          src={row.img}
                          alt={`${row.team} Wappen`}
                          className="w-6 h-6 rounded-full object-contain bg-white"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700" />
                      )}
                      <span className={`text-sm truncate ${isOwnTeamRow(row) ? 'font-semibold text-primary-900 dark:text-primary-100' : 'font-medium text-gray-900 dark:text-white'}`}>
                        {row.team}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{row.points} Pkt</span>
                  </div>
                  <div className="mt-3 flex items-center text-xs text-gray-600 dark:text-gray-300">
                    <span>Sp: {row.games}</span>
                    <span className="mx-2 text-gray-400 dark:text-gray-500">|</span>
                    <span>S/U/N: {row.won}/{row.draw}/{row.lost}</span>
                    <span className="mx-2 text-gray-400 dark:text-gray-500">|</span>
                    <span>Tore: {row.goal}</span>
                    <span className="mx-2 text-gray-400 dark:text-gray-500">|</span>
                    <span>Dif.: {formatGoalDifference(row.goal)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">#</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Team</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sp</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">S/U/N</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tore</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dif.</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pkt</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {externalTableRows.map((row: any, index: number) => (
                    <tr
                      key={`${row.team}-${index}`}
                      className={getDesktopRowClasses(row)}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{row.place}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          {row.img ? (
                            <img
                              src={row.img}
                              alt={`${row.team} Wappen`}
                              className="w-6 h-6 rounded-full object-contain bg-white"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700" />
                          )}
                          <span className={isOwnTeamRow(row) ? 'font-semibold text-primary-900 dark:text-primary-100' : ''}>{row.team}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{row.games}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{row.won}/{row.draw}/{row.lost}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{row.goal}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-300">{formatGoalDifference(row.goal)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400 py-4">
            {(externalTableError as any)?.response?.data?.error || 'Keine externe Tabelle verfügbar.'}
          </div>
        )}
      </div>

    </div>
  );
}
