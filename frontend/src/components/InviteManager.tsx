import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invitesAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Copy, Plus, Trash2, Link as LinkIcon, Check } from 'lucide-react';

interface InviteManagerProps {
  teamId: number;
  teamName: string;
}

export default function InviteManager({ teamId, teamName }: InviteManagerProps) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const inviteRole = user?.role === 'admin' ? 'trainer' : 'player';
  const inviteRoleLabel = inviteRole === 'trainer' ? 'Trainer' : 'Spieler';
  const inviteHeading = inviteRole === 'player' ? 'Spieler anlegen' : 'Einladungslinks';
  const createButtonLabel = inviteRole === 'player' ? 'Spieler anlegen' : 'Neuer Link';
  const createFormTitle = inviteRole === 'player' ? 'Spieler anlegen' : 'Neuen Einladungslink erstellen';
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = useState('');
  const [createdInviteeName, setCreatedInviteeName] = useState('');
  const [inviteMessageDraft, setInviteMessageDraft] = useState('');
  const [isEditingInviteMessage, setIsEditingInviteMessage] = useState(false);
  
  const [inviteData, setInviteData] = useState({
    role: inviteRole,
    inviteeName: '',
    expiresInDays: 7,
    maxUses: undefined as number | undefined,
  });

  const stepInviteNumber = (field: 'expiresInDays' | 'maxUses', delta: number) => {
    setInviteData((prev) => {
      if (field === 'expiresInDays') {
        const current = Number.isFinite(prev.expiresInDays) ? prev.expiresInDays : 7;
        const nextValue = Math.min(365, Math.max(1, current + delta));
        return { ...prev, expiresInDays: nextValue };
      }

      const current = prev.maxUses;
      const baseValue = current === undefined ? 1 : current;
      const nextValue = Math.max(1, baseValue + delta);
      return { ...prev, maxUses: nextValue };
    });
  };

  const handleInviteNumberWheel = (event: React.WheelEvent<HTMLInputElement>, field: 'expiresInDays' | 'maxUses') => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1 : -1;
    stepInviteNumber(field, delta);
  };

  const { data: invites, isLoading } = useQuery({
    queryKey: ['team-invites', teamId],
    queryFn: async () => {
      const response = await invitesAPI.getTeamInvites(teamId);
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: () => invitesAPI.createInvite(teamId, inviteData),
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['team-invites', teamId] });
      setShowCreateForm(false);
      const inviteUrl = response?.data?.invite_url || `${window.location.origin}/invite/${response?.data?.token}`;
      setCreatedInviteUrl(inviteUrl);
      setCreatedInviteeName(inviteData.inviteeName || inviteRoleLabel);
      setInviteMessageDraft('');
      setIsEditingInviteMessage(false);
      setInviteData({ role: inviteRole, inviteeName: '', expiresInDays: 7, maxUses: undefined });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (inviteId: number) => invitesAPI.deleteInvite(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invites', teamId] });
    },
  });

  const copyTextToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const fallbackTextarea = document.createElement('textarea');
      fallbackTextarea.value = text;
      fallbackTextarea.style.position = 'fixed';
      fallbackTextarea.style.opacity = '0';
      fallbackTextarea.setAttribute('readonly', '');
      document.body.appendChild(fallbackTextarea);
      fallbackTextarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(fallbackTextarea);
      return copied;
    }
  };

  const buildInviteMessage = (inviteeName: string, inviteUrl: string) => {
    const normalizedInviteeName = (inviteeName || inviteRoleLabel).trim();
    const normalizedTeamLabel = (teamName || 'deinem Team').trim();

    return [
      `Hi ${normalizedInviteeName},`,
      '',
      `ab sofort organisieren wir unsere ${normalizedTeamLabel} über teamvote+.`,
      '',
      'Hier ist dein persönlicher Einladungslink:',
      '',
      inviteUrl,
      '',
      'Klick kurz drauf und registriere dich – dann bist du direkt bei allen Trainings, Spielen und Infos am Start.',
      '',
      'Sportliche Grüße',
    ].join('\n');
  };

  const copyInviteText = async (token: string, inviteeName: string, inviteUrl: string, customMessage?: string) => {
    const inviteMessage = (customMessage || buildInviteMessage(inviteeName, inviteUrl)).trim();
    const copied = await copyTextToClipboard(inviteMessage);
    if (!copied) return;
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteData.inviteeName.trim()) {
      return;
    }
    createMutation.mutate();
  };

  if (isLoading) {
    return <div className="text-center py-4">Lädt...</div>;
  }

  const generatedInviteMessage = (inviteMessageDraft || buildInviteMessage(createdInviteeName, createdInviteUrl)).trim();

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center">
          <LinkIcon className="w-5 h-5 mr-2 text-primary-600" />
          {inviteHeading}
        </h2>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>{createButtonLabel}</span>
          </button>
        )}
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreate} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
          <h3 className="font-semibold">{createFormTitle}</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Einladungsart
            </label>
            <input
              type="text"
              value={inviteRoleLabel}
              readOnly
              title="Einladungsart"
              aria-label="Einladungsart"
              className="input bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vorgegebener Name
            </label>
            <input
              type="text"
              required
              value={inviteData.inviteeName}
              onChange={(e) => setInviteData({ ...inviteData, inviteeName: e.target.value })}
              className="input"
              placeholder={inviteRole === 'trainer' ? 'z. B. Max Trainer' : 'z. B. Lena Spieler'}
            />
            <p className="text-xs text-gray-500 mt-1">
              Der Name wird bei der Registrierung fest übernommen und kann nicht geändert werden.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gültig für (Tage)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => stepInviteNumber('expiresInDays', -1)}
                  className="btn btn-secondary px-3"
                  aria-label="Gültigkeitstage verringern"
                >
                  −
                </button>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={inviteData.expiresInDays}
                  onChange={(e) => setInviteData({ ...inviteData, expiresInDays: parseInt(e.target.value) })}
                  onWheel={(e) => handleInviteNumberWheel(e, 'expiresInDays')}
                  title="Gültigkeitsdauer in Tagen"
                  aria-label="Gültigkeitsdauer in Tagen"
                  className="input text-center"
                />
                <button
                  type="button"
                  onClick={() => stepInviteNumber('expiresInDays', 1)}
                  className="btn btn-secondary px-3"
                  aria-label="Gültigkeitstage erhöhen"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max. Verwendungen
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => stepInviteNumber('maxUses', -1)}
                  className="btn btn-secondary px-3"
                  aria-label="Maximale Verwendungen verringern"
                >
                  −
                </button>
                <input
                  type="number"
                  min="1"
                  placeholder="Unbegrenzt"
                  value={inviteData.maxUses || ''}
                  onChange={(e) => setInviteData({ ...inviteData, maxUses: e.target.value ? parseInt(e.target.value) : undefined })}
                  onWheel={(e) => handleInviteNumberWheel(e, 'maxUses')}
                  className="input text-center"
                />
                <button
                  type="button"
                  onClick={() => stepInviteNumber('maxUses', 1)}
                  className="btn btn-secondary px-3"
                  aria-label="Maximale Verwendungen erhöhen"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn btn-primary"
            >
              {createMutation.isPending ? 'Erstellt...' : createButtonLabel}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="btn btn-secondary"
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {createdInviteUrl && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3 dark:bg-blue-900/20 dark:border-blue-800">
          <p className="text-blue-800 dark:text-blue-200 font-semibold">
            📩 Einladungslink für {createdInviteeName || inviteRoleLabel}
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={createdInviteUrl}
              readOnly
              title="Erstellter Einladungslink"
              aria-label="Erstellter Einladungslink"
              className="input text-sm flex-1"
            />
            <button
              onClick={() => copyInviteText('latest-invite', createdInviteeName || inviteRoleLabel, createdInviteUrl, generatedInviteMessage)}
              className="btn btn-secondary w-full sm:w-auto"
            >
              {copiedToken === 'latest-invite' ? 'Kopiert!' : 'Einladungstext kopieren'}
            </button>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setIsEditingInviteMessage((prev) => !prev)}
              className="text-sm text-blue-700 dark:text-blue-300 hover:underline"
            >
              {isEditingInviteMessage ? 'Textvorschau anzeigen' : 'Text bearbeiten'}
            </button>
            {isEditingInviteMessage ? (
              <textarea
                value={inviteMessageDraft}
                onChange={(e) => setInviteMessageDraft(e.target.value)}
                rows={8}
                title="Einladungstext bearbeiten"
                aria-label="Einladungstext bearbeiten"
                className="input w-full"
              />
            ) : (
              <div className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-md p-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
                {generatedInviteMessage}
              </div>
            )}
          </div>
        </div>
      )}

      {invites && invites.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-600 dark:text-gray-300">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Gültig bis</th>
                <th className="py-2 pr-3">Verwendet</th>
                <th className="py-2 pr-3">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite: any) => {
                const isExpired = invite.expires_at && new Date(invite.expires_at) < new Date();
                const isMaxedOut = invite.max_uses && invite.used_count >= invite.max_uses;
                const inviteUrl = `${window.location.origin}/invite/${invite.token}`;
                const inviteeName = invite.player_name || inviteRoleLabel;

                return (
                  <tr key={invite.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-3 pr-3 font-medium text-gray-900 dark:text-white">{inviteeName}</td>
                    <td className="py-3 pr-3">
                      {(isExpired || isMaxedOut) ? (
                        <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded">
                          {isExpired ? 'Abgelaufen' : 'Limit erreicht'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Aktiv</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-gray-700 dark:text-gray-300">
                      {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString('de-DE') : '-'}
                    </td>
                    <td className="py-3 pr-3 text-gray-700 dark:text-gray-300">
                      {invite.used_count}{invite.max_uses ? ` / ${invite.max_uses}` : ''}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyInviteText(invite.token, inviteeName, inviteUrl)}
                          className="btn btn-secondary flex items-center space-x-1"
                          title="Einladungstext kopieren"
                        >
                          {copiedToken === invite.token ? (
                            <>
                              <Check className="w-4 h-4 text-green-600" />
                              <span className="text-green-600">Kopiert!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              <span>Kopieren</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Einladungslink wirklich löschen?')) {
                              deleteMutation.mutate(invite.id);
                            }
                          }}
                          className="text-red-600 hover:text-red-700"
                          title="Link löschen"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <LinkIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Noch keine Einladungslinks erstellt</p>
          <p className="text-sm mt-1">Erstelle einen Link, um {inviteRoleLabel.toLowerCase()} einzuladen</p>
        </div>
      )}
    </div>
  );
}
