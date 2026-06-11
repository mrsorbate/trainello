import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { teamsAPI } from '../lib/api';

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
            return {
              teamId: Number(team.id),
              teamName: String(team.name || ''),
              leagueName: String(response.data?.leagueName || ''),
              rows: Array.isArray(response.data?.table) ? response.data.table : [],
              source: String(response.data?.source || ''),
              fallbackReason: String(response.data?.diagnostics?.fallback_reason || ''),
            };
          } catch {
            return {
              teamId: Number(team.id),
              teamName: String(team.name || ''),
              leagueName: '',
              rows: [],
              source: '',
              fallbackReason: '',
            };
          }
        })
      );

      return responses;
    },
    enabled: Array.isArray(teams) && teams.length > 0,
  });

  const hasTeams = Array.isArray(teams) && teams.length > 0;
  const sections = useMemo(() => (Array.isArray(tableData) ? tableData : []), [tableData]);

  const getBadgeUrl = (imgUrl: unknown): string | null => {
    if (typeof imgUrl !== 'string' || !imgUrl) return null;
    const fullUrl = imgUrl.startsWith('//') ? `https:${imgUrl}` : imgUrl;
    return `/api/badge-proxy?url=${encodeURIComponent(fullUrl)}`;
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
        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-1">
          Tabellenansicht aus den API-Daten deiner Teams.
        </p>
      </div>

      {!hasTeams ? (
        <div className="card text-sm text-gray-500 dark:text-gray-400">Keine Teams gefunden.</div>
      ) : sections.length === 0 ? (
        <div className="card text-sm text-gray-500 dark:text-gray-400">Keine Tabellen-Daten gefunden.</div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.teamId} className="card space-y-3">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">{section.teamName}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">{section.leagueName || 'Unbekannte Liga'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Quelle: {section.source === 'fussball.de' ? 'fussball.de' : 'Interner Fallback'}
                  {section.fallbackReason ? ` (${section.fallbackReason})` : ''}
                </p>
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
                        <tr key={`${section.teamId}-${index}`}>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{row.place ?? index + 1}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">
                            <div className="flex items-center gap-2">
                              {getBadgeUrl(row.img) ? (
                                <img
                                  src={getBadgeUrl(row.img)!}
                                  alt={`${String(row.team || 'Team')} Wappen`}
                                  className="w-6 h-6 object-contain bg-white rounded"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700" />
                              )}
                              <span>{String(row.team || '-')}</span>
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
