import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, MessageSquare, Vote } from 'lucide-react';
import { postsAPI, teamsAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useSmartBack } from '../hooks/useSmartBack';

type PostItem = {
  id: number;
  team_id: number;
  type: 'announcement' | 'poll';
  title: string;
  content?: string | null;
  poll_options?: string[];
  created_at: string;
  created_by_name?: string;
  my_seen_at?: string | null;
  my_answer_option?: number | null;
  my_answered_at?: string | null;
};

export default function TeamPostsPage() {
  const { id } = useParams<{ id: string }>();
  const teamId = parseInt(id || '0', 10);
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const goBack = useSmartBack();

  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [postType, setPostType] = useState<'announcement' | 'poll'>('announcement');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [optionsText, setOptionsText] = useState('Ja\nNein');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: team } = useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const response = await teamsAPI.getById(teamId);
      return response.data;
    },
    enabled: Number.isInteger(teamId) && teamId > 0,
  });

  const { data: members } = useQuery({
    queryKey: ['team-members', teamId],
    queryFn: async () => {
      const response = await teamsAPI.getMembers(teamId);
      return response.data;
    },
    enabled: Number.isInteger(teamId) && teamId > 0,
  });

  const isTrainer = useMemo(() => {
    const me = (members || []).find((member: any) => member.id === user?.id);
    return me?.role === 'trainer';
  }, [members, user?.id]);

  const { data: posts, isLoading } = useQuery({
    queryKey: ['team-posts', teamId, scope],
    queryFn: async () => {
      const response = await postsAPI.getTeamPosts(teamId, scope);
      return response.data as PostItem[];
    },
    enabled: Number.isInteger(teamId) && teamId > 0,
  });

  const invalidatePostQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ['team-posts', teamId] });
    await queryClient.invalidateQueries({ queryKey: ['open-posts'] });
  };

  const markSeenMutation = useMutation({
    mutationFn: (postId: number) => postsAPI.markSeen(teamId, postId),
    onSuccess: async () => {
      await invalidatePostQueries();
    },
    onError: () => {
      setErrorMessage('Konnte nicht als gelesen markieren.');
    },
  });

  const answerPollMutation = useMutation({
    mutationFn: ({ postId, optionIndex }: { postId: number; optionIndex: number }) =>
      postsAPI.answerPoll(teamId, postId, optionIndex),
    onSuccess: async () => {
      await invalidatePostQueries();
    },
    onError: () => {
      setErrorMessage('Konnte die Antwort nicht speichern.');
    },
  });

  const createPostMutation = useMutation({
    mutationFn: async () => {
      const normalizedTitle = title.trim();
      const normalizedContent = content.trim();
      const options = optionsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (!normalizedTitle) {
        throw new Error('Titel fehlt');
      }

      if (postType === 'announcement' && !normalizedContent) {
        throw new Error('Nachricht fehlt');
      }

      if (postType === 'poll' && options.length < 2) {
        throw new Error('Bitte mindestens 2 Antwortoptionen angeben.');
      }

      return postsAPI.createTeamPost(teamId, {
        type: postType,
        title: normalizedTitle,
        content: postType === 'announcement' ? normalizedContent : undefined,
        options: postType === 'poll' ? options : undefined,
      });
    },
    onSuccess: async () => {
      setTitle('');
      setContent('');
      setOptionsText('Ja\nNein');
      setErrorMessage(null);
      await invalidatePostQueries();
    },
    onError: (error: any) => {
      setErrorMessage(error?.message || 'Beitrag konnte nicht erstellt werden.');
    },
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
      <div className="card">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => goBack(`/teams/${teamId}`)}
            className="mt-0.5 sm:mt-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            aria-label="Zurueck"
            title="Zurueck"
          >
            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white break-words">Nachrichten & Umfragen</h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-1 break-words">
              {team?.name || 'Team'}
            </p>
          </div>
        </div>
      </div>

      {isTrainer && (
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Neu erstellen</h2>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPostType('announcement')}
              className={`px-3 py-2 rounded-md text-sm border ${
                postType === 'announcement'
                  ? 'bg-primary-100 border-primary-400 text-primary-900 dark:bg-primary-900/40 dark:border-primary-600 dark:text-primary-100'
                  : 'bg-white border-gray-300 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200'
              }`}
            >
              Nachricht
            </button>
            <button
              type="button"
              onClick={() => setPostType('poll')}
              className={`px-3 py-2 rounded-md text-sm border ${
                postType === 'poll'
                  ? 'bg-primary-100 border-primary-400 text-primary-900 dark:bg-primary-900/40 dark:border-primary-600 dark:text-primary-100'
                  : 'bg-white border-gray-300 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200'
              }`}
            >
              Umfrage
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Titel</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="input"
              placeholder="Kurze Ueberschrift"
            />
          </div>

          {postType === 'announcement' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nachricht</label>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className="input min-h-[120px]"
                placeholder="Nachricht fuer das Team"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Antwortoptionen (eine pro Zeile)</label>
              <textarea
                value={optionsText}
                onChange={(event) => setOptionsText(event.target.value)}
                className="input min-h-[120px]"
                placeholder="Ja&#10;Nein"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              createPostMutation.mutate();
            }}
            disabled={createPostMutation.isPending}
            className="btn btn-primary"
          >
            {createPostMutation.isPending ? 'Speichere...' : 'Veroeffentlichen'}
          </button>
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Eintraege</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScope('open')}
              className={`px-3 py-2 rounded-md text-sm border ${
                scope === 'open'
                  ? 'bg-primary-100 border-primary-400 text-primary-900 dark:bg-primary-900/40 dark:border-primary-600 dark:text-primary-100'
                  : 'bg-white border-gray-300 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200'
              }`}
            >
              Offen
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-3 py-2 rounded-md text-sm border ${
                scope === 'all'
                  ? 'bg-primary-100 border-primary-400 text-primary-900 dark:bg-primary-900/40 dark:border-primary-600 dark:text-primary-100'
                  : 'bg-white border-gray-300 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200'
              }`}
            >
              Alle
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <p className="text-gray-500 dark:text-gray-400">Lade Eintraege...</p>
        ) : posts && posts.length > 0 ? (
          <div className="space-y-3">
            {posts.map((post) => {
              const isAnnouncementDone = Boolean(post.my_seen_at);
              const isPollDone = typeof post.my_answer_option === 'number' || Boolean(post.my_answered_at);
              return (
                <article key={post.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {post.type === 'announcement' ? 'Nachricht' : 'Umfrage'}
                      </p>
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">{post.title}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formatDate(post.created_at)}{post.created_by_name ? ` • von ${post.created_by_name}` : ''}
                      </p>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {post.type === 'announcement' && isAnnouncementDone && 'Gelesen'}
                      {post.type === 'poll' && isPollDone && 'Beantwortet'}
                    </div>
                  </div>

                  {post.content && (
                    <p className="mt-3 text-sm sm:text-base text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{post.content}</p>
                  )}

                  {post.type === 'poll' && Array.isArray(post.poll_options) && post.poll_options.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {post.poll_options.map((option, optionIndex) => {
                        const isSelected = post.my_answer_option === optionIndex;
                        return (
                          <button
                            key={`${post.id}-${optionIndex}`}
                            type="button"
                            disabled={answerPollMutation.isPending || isPollDone}
                            onClick={() => answerPollMutation.mutate({ postId: post.id, optionIndex })}
                            className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                              isSelected
                                ? 'bg-green-100 border-green-400 text-green-900 dark:bg-green-900/30 dark:border-green-600 dark:text-green-100'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <Vote className="w-4 h-4" />
                              {option}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {post.type === 'announcement' && !isAnnouncementDone && (
                    <button
                      type="button"
                      onClick={() => markSeenMutation.mutate(post.id)}
                      disabled={markSeenMutation.isPending}
                      className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Als gelesen markieren
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <p className="text-gray-600 dark:text-gray-300">Keine Eintraege gefunden.</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {scope === 'open' ? 'Aktuell ist nichts offen.' : 'Noch keine Nachrichten oder Umfragen erstellt.'}
            </p>
            <div className="mt-4">
              <Link to={`/teams/${teamId}`} className="text-primary-600 hover:underline">
                Zurueck zur Teamseite
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
