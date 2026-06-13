import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { teamsAPI } from '../lib/api';
import type { Team } from '../types/domain';

interface ExternalTableRow {
  place?: number | string | null;
  team?: string | null;
  games?: number | string | null;
  goal?: string | null;
  goals?: string | null;
  img?: string | null;
  logo?: string | null;
  points?: number | string | null;
}

interface ExternalTableEntry {
  table?: ExternalTableRow[];
  leagueName?: string | null;
  source_id?: string | number | null;
  matched_team_name?: string | null;
}

interface TableSection {
  key: string;
  teamId: number;
  teamName: string;
  leagueName: string;
  matchedTeamName: string;
  rows: ExternalTableRow[];
}

export default function MyTablePage() {
  const { data: teams, isLoading: teamsLoading, error: teamsError } = useQuery<Team[]>({
    queryKey: ['my-table-teams'],
    queryFn: async () => {
      const response = await teamsAPI.getAll();
      return response.data as Team[];
    },
  });

  const { data: tableData, isLoading: tableLoading, error: tableError } = useQuery<TableSection[]>({
    queryKey: ['my-table-data', Array.isArray(teams) ? teams.map((team) => team.id).join(',') : 'none'],
    queryFn: async () => {
      const teamList = Array.isArray(teams) ? teams : [];
      const responses = await Promise.all(
        teamList.map(async (team) => {
          try {
            const response = await teamsAPI.getExternalTable(Number(team.id));
            const tableEntries: ExternalTableEntry[] = Array.isArray(response.data?.tables) && response.data.tables.length > 0
              ? response.data.tables
              : [{
                  table: response.data?.table,
                  leagueName: response.data?.leagueName,
                  source_id: response.data?.source_id,
                }];

            return tableEntries.map((entry, index): TableSection => ({
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

  const hasReserveMarker = (value: string): boolean => /(?:ii|2)$/.test(value);

  const normalizeBadgeUrl = (value: unknown): string | null => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    return raw.startsWith('//') ? `https:${raw}` : raw;
  };

  const isOwnTeamRow = (section: TableSection, row: ExternalTableRow): boolean => {
    const ownCandidates = [section?.matchedTeamName, section?.teamName]
      .map((name) => normalizeTeamName(name))
      .filter(Boolean);
    if (ownCandidates.length === 0) return false;

    const rowName = normalizeTeamName(row?.team);
    if (!rowName) return false;

    return ownCandidates.some((candidate) => (
      rowName === candidate
      || (
        hasReserveMarker(rowName) === hasReserveMarker(candidate)
        && rowName.length >= 6
        && candidate.length >= 6
        && (rowName.includes(candidate) || candidate.includes(rowName))
      )
    ));
  };

  if (teamsLoading || (hasTeams && tableLoading)) {
    return <div className="loading-card">Tabellen werden geladen...</div>;
  }

  if (teamsError || tableError) {
    return <div className="text-sm text-red-400 py-4">Tabellen konnten nicht geladen werden.</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-3xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary-400" />
          <span>Meine Tabelle</span>
        </h1>
      </div>

      {!hasTeams ? (
        <div className="empty-state">
          <BarChart3 className="empty-state-icon" />
          <p>Keine Teams gefunden.</p>
        </div>
      ) : sections.length === 0 ? (
        <div className="empty-state">
          <BarChart3 className="empty-state-icon" />
          <p>Keine Tabellen-Daten gefunden.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => {
            const displayTeamName = String(section.matchedTeamName || section.teamName || '').trim();

            return (
            <div key={section.key || section.teamId} className="card space-y-3">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-white">
                  {displayTeamName || section.teamName}
                  <span className="ml-2 text-xs sm:text-sm font-normal text-gray-400">
                    {section.leagueName || 'Unbekannte Liga'}
                  </span>
                </h2>
              </div>

              {Array.isArray(section.rows) && section.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800">
                      <tr>
                        <th className="eyebrow-label px-3 py-2 text-left">#</th>
                        <th className="eyebrow-label px-3 py-2 text-left">Team</th>
                        <th className="eyebrow-label px-3 py-2 text-left">Sp</th>
                        <th className="eyebrow-label px-3 py-2 text-left">Tore</th>
                        <th className="eyebrow-label px-3 py-2 text-left">Pkt</th>
                      </tr>
                    </thead>
                    <tbody className="bg-gray-900 divide-y divide-gray-700">
                      {section.rows.map((row, index) => (
                        <tr
                          key={`${section.teamId}-${index}`}
                          className={isOwnTeamRow(section, row)
                            ? 'bg-primary-900/40'
                            : ''}
                        >
                          <td className="px-3 py-2 text-sm text-white">{row.place ?? index + 1}</td>
                          <td className="px-3 py-2 text-sm text-white">
                            <div className="flex items-center gap-2">
                              {normalizeBadgeUrl(row?.img) ? (
                                <img
                                  src={normalizeBadgeUrl(row?.img)!}
                                  alt={`${String(row.team || 'Team')} Wappen`}
                                  className="w-6 h-6 crest-badge rounded"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-gray-700" />
                              )}
                              <span className={isOwnTeamRow(section, row) ? 'font-semibold text-primary-100' : ''}>{String(row.team || '-')}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-300">{row.games ?? '-'}</td>
                          <td className="px-3 py-2 text-sm text-gray-300">{String(row.goal || '-')}</td>
                          <td className="px-3 py-2 text-sm font-semibold text-white">{row.points ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-gray-400">Für dieses Team ist keine Tabelle verfügbar.</div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
