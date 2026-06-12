import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { teamsAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Calendar, Users, BarChart, ArrowLeft, Settings, MessageSquare } from 'lucide-react';
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

        <Link
          to={`/teams/${teamId}/posts`}
          className="card hover:shadow-md transition-shadow flex items-start sm:items-center space-x-2 sm:space-x-4"
        >
          <div className="bg-amber-100 p-2.5 sm:p-3 rounded-lg">
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-amber-700" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">Nachrichten &amp; Umfragen</h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 break-words">Offene Eintraege ansehen</p>
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

    </div>
  );
}
