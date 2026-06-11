import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { teamsAPI, badgeProxyUrl } from '../lib/api';

export default function MyTablePage() {
  const { data: teams, isLoading: teamsLoading, error: teamsError } = useQuery({
    queryKey: ['my-table-teams'],
    queryFn: async () => {
      const response = await teamsAPI.getAll();
      return response.data;
    },
  });

  const { data: tableData, isLoading: tableLoading, error: tableError } = useQuery({
    queryKey: ['my-table-data', Array.isArray(teams) ? teams.map((team: any) => team.id).join(',') : 'none'],
    queryFn: async () => {
      const teamList = Array.isArray(teams) ? teams : [];
      const responses = await Promise.all(
        teamList.map(async (team: any) => {
          try {
            const response = await teamsAPI.getExternalTable(Number(team.id));
            const tableEntries = Array.isArray(response.data?.tables) && response.data.tables.length > 0
              ? response.data.tables
              : [{
                  table: response.data?.table,
                  leagueName: response.data?.leagueName,
                  source: response.data?.source,
                  source_id: response.data?.source_id,
                }];

            return tableEntries.map((entry: any, index: number) => ({
              key: `${Number(team.id)}-${String(entry?.source_id || index)}`,
              teamId: Number(team.id),
              teamName: String(team.name || ''),
              leagueName: String(entry?.leagueName || response.data?.leagueName || ''),
              matchedTeamName: String(entry?.matched_team_name || '').trim(),
              rows: Array.isArray(entry?.table) ? entry.table : [],
            }));
          } catch {
            return [{
              key: `${Number(team.id)}-fallback`,
              teamId: Number(team.id),
              teamName: String(team.name || ''),
              leagueName: '',
              matchedTeamName: '',
              rows: [],
            }];
          }
        })
      );

      return responses.flat();
    },
    enabled: Array.isArray(teams) && teams.length > 0,
  });

  const hasTeams = Array.isArray(teams) && teams.length > 0;
  const sections = useMemo(() => (Array.isArray(tableData) ? tableData : []), [tableData]);

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

  const isOwnTeamRow = (section: any, row: any): boolean => {
    const ownCandidates = [section?.matchedTeamName || section?.teamName]
      .map((name) => normalizeTeamName(name))
      .filter(Boolean);
    if (ownCandidates.length === 0) return false;

    const rowName = normalizeTeamName(row?.team);
    if (!rowName) return false;

    return ownCandidates.some((candidate) => (
      rowName === candidate
      || rowName.includes(candidate)
    ));
  };

  if (teamsLoading || (hasTeams && tableLoading)) {
    return <div className="text-sm text-gray-500 dark:text-gray-400 py-4">Lädt Tabellen...</div>;
  }

  if (teamsError || tableError) {
    return <div className="text-sm text-red-600 dark:text-red-400 py-4">Tabellen konnten nicht geladen werden.</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary-600" />
          <span>Meine Tabelle</span>
        </h1>
      </div>

      {!hasTeams ? (
        <div className="card text-sm text-gray-500 dark:text-gray-400">Keine Teams gefunden.</div>
      ) : sections.length === 0 ? (
        <div className="card text-sm text-gray-500 dark:text-gray-400">Keine Tabellen-Daten gefunden.</div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.key || section.teamId} className="card space-y-3">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">{section.teamName}</h2>
                {section.matchedTeamName && normalizeTeamName(section.matchedTeamName) !== normalizeTeamName(section.teamName) && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{section.matchedTeamName}</p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">{section.leagueName || 'Unbekannte Liga'}</p>
              </div>

              {Array.isArray(section.rows) && section.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">#</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Team</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sp</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tore</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Pkt</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                      {section.rows.map((row: any, index: number) => (
                        <tr
                          key={`${section.teamId}-${index}`}
                          className={isOwnTeamRow(section, row)
                            ? 'bg-primary-100 dark:bg-primary-900/40'
                            : ''}
                        >
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{row.place ?? index + 1}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">
                            <div className="flex items-center gap-2">
                              {badgeProxyUrl(typeof row.img === 'string' ? row.img : null) ? (
                                <img
                                  src={badgeProxyUrl(typeof row.img === 'string' ? row.img : null)!}
                                  alt={`${String(row.team || 'Team')} Wappen`}
                                  className="w-6 h-6 object-contain bg-white rounded"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700" />
                              )}
                              <span className={isOwnTeamRow(section, row) ? 'font-semibold text-primary-900 dark:text-primary-100' : ''}>{String(row.team || '-')}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{row.games ?? '-'}</td>
                          <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{String(row.goal || '-')}</td>
                          <td className="px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white">{row.points ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">Für dieses Team ist keine Tabelle verfügbar.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
