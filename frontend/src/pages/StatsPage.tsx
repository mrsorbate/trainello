import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { statsAPI } from '../lib/api';
import { ArrowLeft, TrendingUp, Calendar } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useSmartBack } from '../hooks/useSmartBack';

export default function StatsPage() {
  const { id } = useParams<{ id: string }>();
  const teamId = parseInt(id!);
  const { user } = useAuthStore();
  const goBack = useSmartBack();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['team-stats', teamId],
    queryFn: async () => {
      const response = await statsAPI.getTeamStats(teamId);
      return response.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-9 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  const getRate = (accepted: unknown, total: unknown): number => {
    const acceptedValue = Number(accepted || 0);
    const totalValue = Number(total || 0);
    if (totalValue <= 0) return 0;
    return Math.round((acceptedValue * 100) / totalValue);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center space-x-3 sm:space-x-4">
        <button
          type="button"
          onClick={() => goBack(`/teams/${teamId}`)}
          className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          aria-label="Zurück"
          title="Zurück"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary-600 shrink-0" />
          <span>Statistiken</span>
        </h1>
      </div>

      {/* Event Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card flex flex-col gap-1">
          <span className="stat-label">Vergangene Termine</span>
          <span className="stat-value">{stats?.events?.past || 0}</span>
          <div className="w-8 h-1 rounded-full bg-green-500 mt-1" />
        </div>
        <div className="card flex flex-col gap-1">
          <span className="stat-label">Training</span>
          <span className="stat-value">{stats?.events?.pastByCategory?.training || 0}</span>
          <div className="w-8 h-1 rounded-full bg-primary-500 mt-1" />
        </div>
        <div className="card flex flex-col gap-1">
          <span className="stat-label">Spiele</span>
          <span className="stat-value">{stats?.events?.pastByCategory?.match || 0}</span>
          <div className="w-8 h-1 rounded-full bg-accent-400 mt-1" />
        </div>
        <div className="card flex flex-col gap-1">
          <span className="stat-label">Sonstiges</span>
          <span className="stat-value">{stats?.events?.pastByCategory?.other || 0}</span>
          <div className="w-8 h-1 rounded-full bg-purple-500 mt-1" />
        </div>
      </div>

      {/* Attendance Statistics */}
      <div className="card">
        <h2 className="section-heading mb-5">
          <TrendingUp className="w-5 h-5 text-primary-400" />
          {user?.role === 'player' ? 'Meine Anwesenheitsstatistik' : 'Anwesenheitsstatistik'}
        </h2>
        <div className="space-y-3 md:hidden">
          {stats?.attendance?.map((player: any) => {
            const rate = player.attendance_rate || 0;
            const rateColor = rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-accent-400' : 'bg-primary-500';
            return (
            <div key={player.id} className="rounded-xl border border-gray-700/60 p-3 bg-gray-900/60">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-white">{player.name}</p>
                <span className={`text-sm font-bold font-heading ${rate >= 80 ? 'text-green-400' : rate >= 50 ? 'text-accent-400' : 'text-primary-400'}`}>
                  {rate}%
                </span>
              </div>
              <div className="progress-bar mb-3">
                <div
                  className={`progress-bar-fill ${rateColor}`}
                  style={{ width: `${rate}%` }}
                  role="progressbar"
                  aria-valuenow={rate}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <span className="text-green-400 font-medium">✓ {player.accepted} Zusagen</span>
                <span className="text-red-400 font-medium">✗ {player.declined} Absagen</span>
                <span className="text-gray-400">{player.pending} offen</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-gray-400">
                <span>Gesamt: <span className="text-gray-200">{player.accepted}/{player.total_events}</span></span>
                <span>Training: <span className="text-gray-200">{getRate(player.accepted_training, player.total_training)}%</span></span>
                <span>Spiele: <span className="text-gray-200">{getRate(player.accepted_match, player.total_match)}%</span></span>
                <span>Sonstiges: <span className="text-gray-200">{getRate(player.accepted_other, player.total_other)}%</span></span>
              </div>
            </div>
            );
          })}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Spieler
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Gesamt
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Training
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Spiele
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Sonstiges
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Zugesagt
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Abgesagt
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Keine Antwort
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {stats?.attendance?.map((player: any) => (
                <tr key={player.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{player.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <progress
                        className="w-24 h-2 mr-2 [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-bar]:dark:bg-gray-700 [&::-webkit-progress-value]:bg-green-600 [&::-moz-progress-bar]:bg-green-600 rounded-full overflow-hidden"
                        max={100}
                        value={getRate(player.accepted, player.total_events)}
                        title="Teilnahmequote"
                        aria-label="Teilnahmequote"
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {player.accepted}/{player.total_events} ({getRate(player.accepted, player.total_events)}%)
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 font-medium">
                    {player.accepted_training}/{player.total_training} ({getRate(player.accepted_training, player.total_training)}%)
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 font-medium">
                    {player.accepted_match}/{player.total_match} ({getRate(player.accepted_match, player.total_match)}%)
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 font-medium">
                    {player.accepted_other}/{player.total_other} ({getRate(player.accepted_other, player.total_other)}%)
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-green-700 font-medium">{player.accepted}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-red-700 font-medium">{player.declined}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{player.pending}</span>
                  </td>
                </tr>
              ))}            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
