import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invitesAPI } from '../lib/api';
import { Copy, Plus, Trash2, Users } from 'lucide-react';
import { useToast } from '../lib/useToast';
import AccessibleModal from './AccessibleModal';
import type { Invite } from '../types/domain';

interface PlayerInviteManagerProps {
  teamId: number;
}

export default function PlayerInviteManager({ teamId }: PlayerInviteManagerProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [inviteToDelete, setInviteToDelete] = useState<Invite | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedInviteForShare, setSelectedInviteForShare] = useState<Invite | null>(null);
  const [inviteMessageDraft, setInviteMessageDraft] = useState('');
  const [isEditingInviteMessage, setIsEditingInviteMessage] = useState(false);

  const [inviteData, setInviteData] = useState({
    inviteeName: '',
    expiresInDays: 7,
  });

  const stepExpiresInDays = (delta: number) => {
    setInviteData((prev) => {
      const current = Number.isFinite(prev.expiresInDays) ? prev.expiresInDays : 7;
      const nextValue = Math.min(365, Math.max(1, current + delta));
      return { ...prev, expiresInDays: nextValue };
    });
  };

  const handleExpiresWheel = (event: React.WheelEvent<HTMLInputElement>) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1 : -1;
    stepExpiresInDays(delta);
  };

  const { data: invites, isLoading } = useQuery({
    queryKey: ['team-invites', teamId],
    queryFn: async () => {
      const response = await invitesAPI.getTeamInvites(teamId);
      // Filter nur Spieler-Einladungen
      const teamInvites = response.data as Invite[];
      return teamInvites.filter((invite) =>
        invite.player_name && (!invite.max_uses || invite.used_count < invite.max_uses)
      );
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      invitesAPI.createInvite(teamId, {
        role: 'player',
        inviteeName: inviteData.inviteeName,
        expiresInDays: inviteData.expiresInDays,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invites', teamId] });
      showToast('Spieler-Einladung erstellt', 'success');
      setShowCreateForm(false);
      setInviteData({ inviteeName: '', expiresInDays: 7 });
    },
    onError: () => {
      showToast('Fehler beim Erstellen der Einladung', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (inviteId: number) => invitesAPI.deleteInvite(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invites', teamId] });
      showToast('Einladung gelöscht', 'success');
      setDeletingId(null);
    },
    onError: () => {
      showToast('Fehler beim Löschen', 'error');
    },
  });

  const buildInviteMessage = (playerName: string, inviteUrl: string) => {
    return [
      `Hi ${playerName},`,
      '',
      `ab sofort organisieren wir unsere Trainings und Spiele über teamvote+.`,
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

  const copyInviteText = async (token: string, playerName: string, inviteUrl: string, customMessage?: string) => {
    const inviteMessage = (customMessage || buildInviteMessage(playerName, inviteUrl)).trim();
    const copied = await copyTextToClipboard(inviteMessage);
    if (!copied) {
      showToast('Fehler beim Kopieren', 'error');
      return;
    }
    setCopiedToken(token);
    showToast('Einladungstext kopiert', 'success');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const openShareModal = (invite: Invite) => {
    setSelectedInviteForShare(invite);
    const inviteUrl = `${window.location.origin}/invite/${invite.token}`;
    setInviteMessageDraft(buildInviteMessage(invite.player_name || 'Spieler', inviteUrl));
    setIsEditingInviteMessage(false);
    setShowShareModal(true);
  };

  const copyLink = async (invite: Invite) => {
    openShareModal(invite);
  };

  const deleteInvite = async (inviteId: number) => {
    setDeletingId(inviteId);
    deleteMutation.mutate(inviteId);
    setShowDeleteModal(false);
    setInviteToDelete(null);
  };

  const closeCreateModal = () => {
    if (createMutation.isPending) return;
    setShowCreateForm(false);
  };

  const closeDeleteModal = () => {
    if (deletingId !== null || deleteMutation.isPending) return;
    setShowDeleteModal(false);
    setInviteToDelete(null);
  };

  const closeShareModal = () => {
    setShowShareModal(false);
    setSelectedInviteForShare(null);
    setInviteMessageDraft('');
    setIsEditingInviteMessage(false);
  };

  const openDeleteModal = (invite: Invite) => {
    setInviteToDelete(invite);
    setShowDeleteModal(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteData.inviteeName.trim()) {
      showToast('Bitte einen Namen eingeben', 'warning');
      return;
    }
    createMutation.mutate();
  };

  if (isLoading) {
    return <div className="text-center py-4">Lädt...</div>;
  }

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h2 className="text-xl font-semibold flex items-center text-white">
          <Users className="w-5 h-5 mr-2" />
          Spieler anlegen & Einladungen
        </h2>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn btn-primary w-full sm:w-auto flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Neuer Spieler</span>
          </button>
        )}
      </div>

      {showCreateForm && (
        <AccessibleModal
          labelledBy="create-player-title"
          onClose={closeCreateModal}
          className="items-end sm:items-center p-0 sm:p-4"
          panelClassName="card max-w-xl w-full max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        >
            <h3 id="create-player-title" className="font-semibold text-white mb-4">Spieler einladen</h3>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Spielername
                </label>
                <input
                  type="text"
                  required
                  value={inviteData.inviteeName}
                  onChange={(e) => setInviteData({ ...inviteData, inviteeName: e.target.value })}
                  className="input"
                  placeholder="z. B. Lena Spieler"
                  title="Spielername"
                  aria-label="Spielername"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Gültig für (Tage)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => stepExpiresInDays(-1)}
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
                    onWheel={handleExpiresWheel}
                    className="input text-center"
                    title="Gültigkeitsdauer in Tagen"
                    aria-label="Gültigkeitsdauer in Tagen"
                  />
                  <button
                    type="button"
                    onClick={() => stepExpiresInDays(1)}
                    className="btn btn-secondary px-3"
                    aria-label="Gültigkeitstage erhöhen"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button type="submit" disabled={createMutation.isPending} className="btn btn-primary w-full sm:w-auto">
                  {createMutation.isPending ? 'Erstellt...' : 'Einladung erstellen'}
                </button>
                <button type="button" onClick={closeCreateModal} className="btn btn-secondary w-full sm:w-auto">
                  Abbrechen
                </button>
              </div>
            </form>
        </AccessibleModal>
      )}

      {invites && invites.length > 0 ? (
        <>
        <div className="space-y-2 md:hidden">
          {invites.map((invite) => (
            <div key={`invite-mobile-${invite.id}`} className="rounded-lg border border-gray-700 p-3 bg-gray-900">
              <p className="font-medium text-white">{invite.player_name}</p>
              <p className="text-sm text-gray-400 mt-1">
                Gültig bis: {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString('de-DE') : 'Unbegrenzt'}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => copyLink(invite)}
                  disabled={deletingId === invite.id}
                  className="btn btn-secondary flex-1 flex items-center justify-center space-x-1"
                  title="Einladung teilen"
                  aria-label={`Einladung für ${invite.player_name} teilen`}
                >
                  <Copy className="w-4 h-4" />
                  <span>Teilen</span>
                </button>
                <button
                  onClick={() => openDeleteModal(invite)}
                  disabled={deletingId === invite.id}
                  className="btn btn-secondary flex-1 text-red-400"
                  title="Löschen"
                  aria-label={`Einladung für ${invite.player_name} löschen`}
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Gültig bis</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-white">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr
                  key={`invite-${invite.id}`}
                  className="border-b border-gray-700 hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-white font-medium">{invite.player_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString('de-DE') : 'Unbegrenzt'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right space-x-2 flex items-center justify-end">
                    <button
                      onClick={() => copyLink(invite)}
                      disabled={deletingId === invite.id}
                      className="p-2 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:text-white"
                      title="Einladung teilen"
                      aria-label={`Einladung für ${invite.player_name} teilen`}
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => openDeleteModal(invite)}
                      disabled={deletingId === invite.id}
                      className="p-2 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:text-red-400"
                      title="Löschen"
                      aria-label={`Einladung für ${invite.player_name} löschen`}
                    >
                      {deletingId === invite.id ? (
                        <div className="w-5 h-5 animate-spin border-2 border-red-400 border-t-transparent rounded-full" />
                      ) : (
                        <Trash2 className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <div className="text-center py-8 text-gray-400">
          <Plus className="w-12 h-12 mx-auto mb-2 text-gray-500" />
          <p>Noch keine Spieler eingeladen</p>
          <p className="text-sm mt-1">Erstelle eine Einladung, um Spieler hinzuzufügen</p>
        </div>
      )}

      {/* Delete Invite Modal */}
      {showDeleteModal && inviteToDelete && (
        <AccessibleModal
          labelledBy="delete-invite-title"
          onClose={closeDeleteModal}
          className="items-end sm:items-center p-0 sm:p-4"
          panelClassName="card max-w-md w-full rounded-t-2xl sm:rounded-2xl"
        >
            <h3 id="delete-invite-title" className="font-semibold text-white mb-4">
              Einladung löschen?
            </h3>
            <p className="text-gray-300 mb-6">
              Soll die Einladung für <strong>{inviteToDelete.player_name}</strong> wirklich gelöscht werden?
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => deleteInvite(inviteToDelete.id)}
                disabled={deletingId === inviteToDelete.id}
                className="btn btn-primary flex-1"
              >
                {deletingId === inviteToDelete.id ? 'Wird gelöscht...' : 'Ja, löschen'}
              </button>
              <button
                onClick={closeDeleteModal}
                className="btn btn-secondary flex-1"
              >
                Abbrechen
              </button>
            </div>
        </AccessibleModal>
      )}

      {/* Share Invite Modal */}
      {showShareModal && selectedInviteForShare && (
        <AccessibleModal
          labelledBy="share-invite-title"
          onClose={closeShareModal}
          className="items-end sm:items-center p-0 sm:p-4"
          panelClassName="card max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        >
            <h3 id="share-invite-title" className="font-semibold text-white mb-4">
              Einladung für {selectedInviteForShare.player_name} teilen
            </h3>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-400 mb-2">Einladungstext:</p>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isEditingInviteMessage) {
                        setIsEditingInviteMessage(true);
                        return;
                      }
                      setIsEditingInviteMessage(false);
                    }}
                    className="text-sm text-primary-400 hover:underline"
                  >
                    {isEditingInviteMessage ? 'Vorschau anzeigen' : 'Text bearbeiten'}
                  </button>
                </div>

                {isEditingInviteMessage ? (
                  <textarea
                    value={inviteMessageDraft}
                    onChange={(e) => setInviteMessageDraft(e.target.value)}
                    rows={10}
                    title="Einladungstext bearbeiten"
                    aria-label="Einladungstext bearbeiten"
                    className="input w-full text-sm"
                  />
                ) : (
                  <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 whitespace-pre-wrap text-sm text-gray-300">
                    {inviteMessageDraft}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => {
                    const inviteUrl = `${window.location.origin}/invite/${selectedInviteForShare.token}`;
                    copyInviteText(selectedInviteForShare.token, selectedInviteForShare.player_name || 'Spieler', inviteUrl, inviteMessageDraft);
                  }}
                  className="btn btn-primary flex-1"
                >
                  {copiedToken === selectedInviteForShare.token ? 'Kopiert!' : 'Text kopieren'}
                </button>
                <button
                  onClick={closeShareModal}
                  className="btn btn-secondary flex-1"
                >
                  Schließen
                </button>
              </div>
            </div>
        </AccessibleModal>
      )}
    </div>
  );
}
