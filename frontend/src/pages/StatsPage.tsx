import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { statsAPI } from '../lib/api';
import { ArrowLeft, TrendingUp, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useSmartBack } from '../hooks/useSmartBack';

interface AttendanceEntry {
  id: number;
  name: string;
  attendance_rate: number;
  accepted: number;
  declined: number;
  pending: number;
  accepted_training: number;
  total_training: number;
  accepted_match: number;
  total_match: number;
  accepted_other: number;
  total_other: number;
}

interface TeamStatsResponse {
  attendance?: AttendanceEntry[];
  events?: {
    past?: number;
    pastByCategory?: {
      training?: number;
      match?: number;
      other?: number;
    };
  };
}

const chartTokens = {
  accepted: '#22c55e',
  declined: '#ef4444',
  pending: '#4b5563',
  ring: '#1f2937',
  textMuted: '#9ca3af',
};

const statAccentClass = {
  past: 'bg-green-500',
  training: 'bg-blue-500',
  match: 'bg-primary-500',
  other: 'bg-gray-500',
};

function DonutChart({ accepted, declined, pending }: { accepted: number; declined: number; pending: number }) {
  const size = 104;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 9;
  const C = 2 * Math.PI * r;
  const total = accepted + declined + pending;
  const rate = total > 0 ? Math.round((accepted / total) * 100) : 0;

  const segments = [
    { value: accepted, color: chartTokens.accepted },
    { value: declined, color: chartTokens.declined },
    { value: pending, color: chartTokens.pending },
  ];

  let cumulative = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`Anwesenheitsquote ${rate} Prozent`}
    >
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={chartTokens.ring} strokeWidth="11" />
      {total > 0 && segments.filter(s => s.value > 0).map((seg, i) => {
        const segLen = (seg.value / total) * C;
        const offset = -cumulative;
        cumulative += segLen;
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="11"
            strokeDasharray={`${segLen} ${C - segLen}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
      <text
        x={cx} y={cy - 4}
        textAnchor="middle"
        fill="white"
        fontSize="17"
        fontWeight="bold"
        fontFamily="Barlow Condensed, system-ui, sans-serif"
      >
        {total > 0 ? `${rate}%` : '—'}
      </text>
      <text
        x={cx} y={cy + 11}
        textAnchor="middle"
        fill={chartTokens.textMuted}
        fontSize="8.5"
        fontFamily="Barlow, system-ui, sans-serif"
      >
        {total > 0 ? 'Zusagen' : 'Keine Daten'}
      </text>
    </svg>
  );
}

export default function StatsPage() {
  const { id } = useParams<{ id: string }>();
  const teamId = parseInt(id!);
  const { user } = useAuthStore();
  const goBack = useSmartBack();
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['team-stats', teamId],
    queryFn: async () => {
      const response = await statsAPI.getTeamStats(teamId);
      return response.data as TeamStatsResponse;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-9 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
        </div>
        <div className="skeleton h-44 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  const getRate = (accepted: unknown, total: unknown): number => {
    const a = Number(accepted || 0);
    const t = Number(total || 0);
    if (t <= 0) return 0;
    return Math.round((a * 100) / t);
  };

  const attendance: AttendanceEntry[] = stats?.attendance ?? [];
  const sorted = [...attendance].sort((a, b) => (b.attendance_rate || 0) - (a.attendance_rate || 0));

  const totals = attendance.reduce(
    (acc, p) => ({
      accepted: acc.accepted + (p.accepted || 0),
      declined: acc.declined + (p.declined || 0),
      pending: acc.pending + (p.pending || 0),
    }),
    { accepted: 0, declined: 0, pending: 0 },
  );

  const isTrainer = user?.role === 'trainer';

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => goBack(`/teams/${teamId}`)}
          className="icon-button rounded-full"
          aria-label="Zurück"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-heading font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary-500 shrink-0" />
          Statistiken
        </h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Vergangene Termine', value: stats?.events?.past || 0, accent: statAccentClass.past },
          { label: 'Training', value: stats?.events?.pastByCategory?.training || 0, accent: statAccentClass.training },
          { label: 'Spiele', value: stats?.events?.pastByCategory?.match || 0, accent: statAccentClass.match },
          { label: 'Sonstiges', value: stats?.events?.pastByCategory?.other || 0, accent: statAccentClass.other },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-gray-800 border border-gray-700/60 rounded-2xl p-4">
            <div className={`w-5 h-1 rounded-full ${kpi.accent} mb-2.5`} />
            <p className="text-2xl font-heading font-bold text-white leading-none">{kpi.value}</p>
            <p className="text-xs text-gray-400 mt-1.5 leading-snug">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Overview with Donut Chart */}
      <div className="bg-gray-800 border border-gray-700/60 rounded-2xl p-4 sm:p-5">
        <p className="eyebrow-label mb-4">
          {isTrainer ? 'Team-Gesamtübersicht' : 'Meine Übersicht'}
        </p>
        <div className="flex items-center gap-5 sm:gap-8">
          <DonutChart
            accepted={totals.accepted}
            declined={totals.declined}
            pending={totals.pending}
          />
          <div className="flex-1 space-y-3">
            {[
              { label: 'Zugesagt', value: totals.accepted, dot: 'bg-green-500', text: 'text-green-400' },
              { label: 'Abgesagt', value: totals.declined, dot: 'bg-primary-500', text: 'text-primary-400' },
              { label: 'Offen / Keine Antwort', value: totals.pending, dot: 'bg-gray-600', text: 'text-gray-400' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2.5">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.dot}`} />
                <span className="text-sm text-gray-400 flex-1">{item.label}</span>
                <span className={`text-base font-heading font-bold tabular-nums ${item.text}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Player Leaderboard */}
      {sorted.length > 0 && (
        <div className="bg-gray-800 border border-gray-700/60 rounded-2xl overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-gray-700/50">
            <p className="eyebrow-label">
              {isTrainer ? 'Spieler-Rangliste' : 'Anwesenheit nach Kategorie'}
            </p>
          </div>
          <ul className="divide-y divide-gray-700/50">
            {sorted.map((player: AttendanceEntry, idx: number) => {
              const rate = player.attendance_rate || 0;
              const isExpanded = expandedPlayer === player.id;
              const rateColor = rate >= 80 ? 'text-green-400' : rate >= 50 ? 'text-accent-400' : 'text-primary-400';
              const barColor = rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-accent-400' : 'bg-primary-500';
              const trainingRate = getRate(player.accepted_training, player.total_training);
              const matchRate = getRate(player.accepted_match, player.total_match);
              const otherRate = getRate(player.accepted_other, player.total_other);

              return (
                <li key={player.id}>
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-700/30 transition-colors text-left cursor-pointer"
                    onClick={() => setExpandedPlayer(isExpanded ? null : player.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`player-detail-${player.id}`}
                  >
                    <span className="w-5 text-xs font-heading text-gray-600 shrink-0 text-right">{idx + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
                      <span className="text-sm font-heading font-bold text-gray-200">
                        {player.name?.charAt(0)?.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{player.name}</p>
                      <div className="mt-1.5 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: `${rate}%` }}
                          role="progressbar"
                          aria-valuenow={rate}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${player.name}: ${rate}% Anwesenheit`}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-sm font-heading font-bold tabular-nums ${rateColor}`}>{rate}%</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div
                      id={`player-detail-${player.id}`}
                      className="px-4 pb-3 pt-1 bg-gray-900/40 animate-slide-down"
                    >
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {[
                          { label: 'Training', rate: trainingRate, accepted: player.accepted_training ?? 0, total: player.total_training ?? 0, textColor: 'text-blue-400' },
                          { label: 'Spiele', rate: matchRate, accepted: player.accepted_match ?? 0, total: player.total_match ?? 0, textColor: 'text-primary-400' },
                          { label: 'Sonstiges', rate: otherRate, accepted: player.accepted_other ?? 0, total: player.total_other ?? 0, textColor: 'text-gray-300' },
                        ].map((cat) => (
                          <div key={cat.label} className="bg-gray-800/60 rounded-xl p-2.5 text-center">
                            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-heading">{cat.label}</p>
                            <p className={`text-lg font-heading font-bold tabular-nums ${cat.textColor} mt-0.5 leading-none`}>{cat.rate}%</p>
                            <p className="text-[10px] text-gray-400 mt-1 tabular-nums">{cat.accepted}/{cat.total}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className="text-green-400 font-medium tabular-nums">{player.accepted} Zusagen</span>
                        <span className="text-primary-400 font-medium tabular-nums">{player.declined} Absagen</span>
                        <span className="text-gray-400 tabular-nums">{player.pending} offen</span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {sorted.length === 0 && (
        <div className="bg-gray-800 border border-gray-700/60 rounded-2xl p-8 text-center">
          <TrendingUp className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Noch keine Statistiken vorhanden.</p>
        </div>
      )}
    </div>
  );
}
