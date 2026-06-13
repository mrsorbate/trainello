import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, MessageSquare, Vote } from 'lucide-react';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const teamId = parseInt(id || '0', 10);
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const goBack = useSmartBack();

  const [scope, setScope] = useState<'open' | 'all'>(searchParams.get('scope') === 'all' ? 'all' : 'open');
  const [postType, setPostType] = useState<'announcement' | 'poll'>('announcement');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [optionsText, setOptionsText] = useState('Ja\nNein');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getSegmentButtonClass = (isActive: boolean) =>
    `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-900/40 border-primary-600 text-primary-100'
        : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700'
    }`;

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

  useEffect(() => {
    const queryScope = searchParams.get('scope') === 'all' ? 'all' : 'open';
    if (queryScope !== scope) {
      setScope(queryScope);
    }
  }, [searchParams, scope]);

  const handleScopeChange = (nextScope: 'open' | 'all') => {
    setScope(nextScope);
    const nextParams = new URLSearchParams(searchParams);
    if (nextScope === 'all') {
      nextParams.set('scope', 'all');
    } else {
      nextParams.delete('scope');
    }
    setSearchParams(nextParams, { replace: true });
  };

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
            className="mt-0.5 sm:mt-0 text-gray-300 hover:text-white"
            aria-label="Zurück"
            title="Zurück"
          >
            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white break-words">Nachrichten & Umfragen</h1>
            <p className="text-sm sm:text-base text-gray-300 mt-1 break-words">
              {team?.name || 'Team'}
            </p>
          </div>
        </div>
      </div>

      {isTrainer && (
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Neue Einträge erstellen</h2>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Eintragstyp auswählen">
            <button
              type="button"
              onClick={() => setPostType('announcement')}
              className={getSegmentButtonClass(postType === 'announcement')}
              aria-pressed={postType === 'announcement'}
            >
              <MessageSquare className="w-4 h-4" />
              Nachricht
            </button>
            <button
              type="button"
              onClick={() => setPostType('poll')}
              className={getSegmentButtonClass(postType === 'poll')}
              aria-pressed={postType === 'poll'}
            >
              <Vote className="w-4 h-4" />
              Umfrage
            </button>
          </div>

          <div>
            <label htmlFor="team-post-title" className="block text-sm font-medium text-gray-300 mb-1">Titel</label>
            <input
              id="team-post-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="input"
              placeholder="Kurze Überschrift"
            />
          </div>

          {postType === 'announcement' ? (
            <div>
              <label htmlFor="team-post-content" className="block text-sm font-medium text-gray-300 mb-1">Nachricht</label>
              <textarea
                id="team-post-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className="input min-h-[120px]"
                placeholder="Nachricht für das Team"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="team-post-options" className="block text-sm font-medium text-gray-300 mb-1">Antwortoptionen (eine pro Zeile)</label>
              <textarea
                id="team-post-options"
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
            {createPostMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Speichert...
              </>
            ) : (
              <>
                {postType === 'announcement' ? <MessageSquare className="w-4 h-4" /> : <Vote className="w-4 h-4" />}
                Veröffentlichen
              </>
            )}
          </button>
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Offene Einträge</h2>
          <div className="flex items-center gap-2" role="group" aria-label="Einträge filtern">
            <button
              type="button"
              onClick={() => handleScopeChange('open')}
              className={getSegmentButtonClass(scope === 'open')}
              aria-pressed={scope === 'open'}
            >
              Offen
            </button>
            <button
              type="button"
              onClick={() => handleScopeChange('all')}
              className={getSegmentButtonClass(scope === 'all')}
              aria-pressed={scope === 'all'}
            >
              Alle
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-red-700 bg-red-900/20 px-3 py-2 text-sm text-red-200" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3" aria-label="Einträge werden geladen">
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-xl border border-gray-700 bg-gray-800 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2 flex-1">
                    <div className="skeleton h-3 w-20" />
                    <div className="skeleton h-5 w-2/3" />
                    <div className="skeleton h-3 w-40" />
                  </div>
                  <div className="skeleton h-5 w-16 rounded-full" />
                </div>
                <div className="skeleton h-10 w-full" />
              </div>
            ))}
          </div>
        ) : posts && posts.length > 0 ? (
          <div className="space-y-3">
            {posts.map((post) => {
              const isAnnouncementDone = Boolean(post.my_seen_at);
              const isPollDone = typeof post.my_answer_option === 'number' || Boolean(post.my_answered_at);
              return (
                <article key={post.id} className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow-label">
                        {post.type === 'announcement' ? 'Nachricht' : 'Umfrage'}
                      </p>
                      <h3 className="text-base sm:text-lg font-semibold text-white">{post.title}</h3>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate(post.created_at)}{post.created_by_name ? ` • von ${post.created_by_name}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {post.type === 'announcement' && isAnnouncementDone && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-green-700 bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-300">
                          <CheckCircle2 className="w-3 h-3" />
                          Gelesen
                        </span>
                      )}
                      {post.type === 'poll' && isPollDone && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-green-700 bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-300">
                          <CheckCircle2 className="w-3 h-3" />
                          Beantwortet
                        </span>
                      )}
                    </div>
                  </div>

                  {post.content && (
                    <p className="mt-3 text-sm sm:text-base text-gray-200 whitespace-pre-wrap">{post.content}</p>
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
                            className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                              isSelected
                                ? 'bg-green-900/30 border-green-600 text-green-100'
                                : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700'
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
                      className="mt-3 btn bg-green-600 text-white hover:bg-green-700"
                    >
                      {markSeenMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {markSeenMutation.isPending ? 'Speichert...' : 'Als gelesen markieren'}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <p className="text-gray-300">Keine Einträge gefunden.</p>
            <p className="text-sm text-gray-400 mt-1">
              {scope === 'open' ? 'Aktuell ist nichts offen.' : 'Noch keine Nachrichten oder Umfragen erstellt.'}
            </p>
            <div className="mt-4">
              <Link to={`/teams/${teamId}`} className="text-primary-400 hover:underline">
                Zurück zur Teamseite
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
