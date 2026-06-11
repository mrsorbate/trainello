import { useState, useRef, Fragment, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Navigate } from 'react-router-dom';
import { Plus, Trash2, Users, UserPlus, UserMinus, Shield, Settings, Upload, Copy, Share2, Check, KeyRound } from 'lucide-react';
import { useToast, type ToastType } from '../lib/useToast';
import { resolveAssetUrl } from '../lib/utils';

const TIMEZONES = [
  'Europe/Berlin',
  'Europe/London',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/Rome',
  'Europe/Brussels',
  'Europe/Budapest',
  'UTC',
];

export default function AdminPage() {
  const { user, logout } = useAuthStore();
  const queryClient = useQueryClient();
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const { showToast: showGlobalToast } = useToast();
  
  const [showOrganizationSettings, setShowOrganizationSettings] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [organizationShortName, setOrganizationShortName] = useState('');
  const [timezone, setTimezone] = useState('Europe/Berlin');
  
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [trainerSearch, setTrainerSearch] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [showDeleteTeamConfirmModal, setShowDeleteTeamConfirmModal] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<any | null>(null);
  
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [showAssignTrainer, setShowAssignTrainer] = useState(false);
  const [selectedTrainer, setSelectedTrainer] = useState('');
  const [showRemoveTrainer, setShowRemoveTrainer] = useState(false);
  const [selectedTrainerToRemove, setSelectedTrainerToRemove] = useState('');
  const [showDeleteOrganizationConfirm, setShowDeleteOrganizationConfirm] = useState(false);
  const [deleteOrganizationConfirmText, setDeleteOrganizationConfirmText] = useState('');
  const [showCreateTrainer, setShowCreateTrainer] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [trainerName, setTrainerName] = useState('');
  const [trainerTeamIds, setTrainerTeamIds] = useState<number[]>([]);
  const [trainerInviteLink, setTrainerInviteLink] = useState('');
  const [trainerInviteMessageDraft, setTrainerInviteMessageDraft] = useState('');
  const [isEditingTrainerInviteMessage, setIsEditingTrainerInviteMessage] = useState(false);
  const [copiedTrainerLink, setCopiedTrainerLink] = useState(false);
  const [showResendTrainerLinkModal, setShowResendTrainerLinkModal] = useState(false);
  const [resendTrainerName, setResendTrainerName] = useState('');
  const [resendTrainerTeams, setResendTrainerTeams] = useState('');
  const [resendTrainerLink, setResendTrainerLink] = useState('');
  const [resendInviteMessageDraft, setResendInviteMessageDraft] = useState('');
  const [isEditingResendInviteMessage, setIsEditingResendInviteMessage] = useState(false);
  const [copiedResendTrainerLink, setCopiedResendTrainerLink] = useState(false);
  const [showDeleteUserConfirmModal, setShowDeleteUserConfirmModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any | null>(null);
  const [showResetPasswordConfirmModal, setShowResetPasswordConfirmModal] = useState(false);
  const [userToResetPassword, setUserToResetPassword] = useState<any | null>(null);
  const [showGeneratedPasswordModal, setShowGeneratedPasswordModal] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [copiedGeneratedPassword, setCopiedGeneratedPassword] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditActorFilter, setAuditActorFilter] = useState('all');
  const [auditPeriodFilter, setAuditPeriodFilter] = useState('all');
  const [expandedAuditLogId, setExpandedAuditLogId] = useState<number | null>(null);

  const showToast = (message: string, type: ToastType = 'error') => {
    showGlobalToast(message, type, { position: 'bottom-right' });
  };

  useEffect(() => {
    const hasOpenModal =
      showAssignTrainer ||
      showDeleteTeamConfirmModal ||
      showRemoveTrainer ||
      showCreateTeam ||
      showCreateTrainer ||
      showCreateAdmin ||
      showResetPasswordConfirmModal ||
      showDeleteUserConfirmModal ||
      showResendTrainerLinkModal ||
      showGeneratedPasswordModal;

    if (!hasOpenModal) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (showGeneratedPasswordModal) {
        setShowGeneratedPasswordModal(false);
        setGeneratedPassword('');
        setCopiedGeneratedPassword(false);
        return;
      }

      if (showResendTrainerLinkModal) {
        setShowResendTrainerLinkModal(false);
        setResendTrainerName('');
        setResendTrainerLink('');
        setCopiedResendTrainerLink(false);
        return;
      }

      if (showDeleteUserConfirmModal) {
        setShowDeleteUserConfirmModal(false);
        setUserToDelete(null);
        return;
      }

      if (showResetPasswordConfirmModal) {
        setShowResetPasswordConfirmModal(false);
        setUserToResetPassword(null);
        return;
      }

      if (showCreateTrainer) {
        closeCreateTrainerModal();
        return;
      }

      if (showCreateAdmin) {
        closeCreateAdminModal();
        return;
      }

      if (showCreateTeam) {
        setShowCreateTeam(false);
        return;
      }

      if (showRemoveTrainer) {
        setShowRemoveTrainer(false);
        setSelectedTrainerToRemove('');
        return;
      }

      if (showDeleteTeamConfirmModal) {
        setShowDeleteTeamConfirmModal(false);
        setTeamToDelete(null);
        return;
      }

      if (showAssignTrainer) {
        setShowAssignTrainer(false);
        setSelectedTrainer('');
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [
    showAssignTrainer,
    showDeleteTeamConfirmModal,
    showRemoveTrainer,
    showCreateTeam,
    showCreateTrainer,
    showCreateAdmin,
    showResetPasswordConfirmModal,
    showDeleteUserConfirmModal,
    showResendTrainerLinkModal,
    showGeneratedPasswordModal,
  ]);

  // Redirect if not admin
  if (user?.role !== 'admin') {
    return <Navigate to="/" />;
  }

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const response = await adminAPI.getSettings();
      setOrganizationName(response.data.name || '');
      setOrganizationShortName(response.data.short_name || '');
      setTimezone(response.data.timezone || 'Europe/Berlin');
      return response.data;
    },
  });

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ['admin-teams'],
    queryFn: async () => {
      const response = await adminAPI.getAllTeams();
      return response.data;
    },
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const response = await adminAPI.getAllUsers();
      return response.data;
    },
  });

  const { data: auditLogs, isLoading: auditLogsLoading, refetch: refetchAuditLogs, isFetching: auditLogsFetching } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      const response = await adminAPI.getAuditLogs(50);
      return response.data;
    },
    refetchInterval: 60000,
  });

  const { data: teamTrainers } = useQuery({
    queryKey: ['admin-team-trainers', selectedTeam],
    queryFn: async () => {
      if (!selectedTeam) return [];
      const response = await adminAPI.getTeamTrainers(selectedTeam);
      return response.data;
    },
    enabled: (showAssignTrainer || showRemoveTrainer) && !!selectedTeam,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data: { organizationName: string; organizationShortName?: string | null; timezone: string }) =>
      adminAPI.updateSettings(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['organization'] });
      setShowOrganizationSettings(false);
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => adminAPI.uploadLogo(file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['organization'] });
      // Reset file input
      if (logoFileInputRef.current) {
        logoFileInputRef.current.value = '';
      }
      showToast('Logo erfolgreich hochgeladen', 'success');
    },
    onError: (error: any) => {
      console.error('Logo upload error:', error);
      showToast('Logo-Upload fehlgeschlagen: ' + (error.response?.data?.error || error.message), 'error');
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => adminAPI.createTeam(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
      await queryClient.refetchQueries({ queryKey: ['admin-teams'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setShowCreateTeam(false);
      setTeamName('');
      setTeamDescription('');
      showToast('Team erfolgreich erstellt', 'success');
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (teamId: number) => adminAPI.deleteTeam(teamId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
      await queryClient.refetchQueries({ queryKey: ['admin-teams'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => adminAPI.deleteUser(userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      await queryClient.refetchQueries({ queryKey: ['admin-users'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
      await queryClient.refetchQueries({ queryKey: ['admin-teams'] });
      await queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });

  const resendTrainerInviteMutation = useMutation({
    mutationFn: (userId: number) => adminAPI.resendTrainerInvite(userId),
  });

  const resetUserPasswordMutation = useMutation({
    mutationFn: (userId: number) => adminAPI.resetUserPassword(userId),
  });

  const addMemberMutation = useMutation({
    mutationFn: (data: { teamId: number; userId: number; role: string }) =>
      adminAPI.addUserToTeam(data.teamId, {
        user_id: data.userId,
        role: data.role,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
      await queryClient.refetchQueries({ queryKey: ['admin-teams'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      await queryClient.refetchQueries({ queryKey: ['admin-users'] });
      if (selectedTeam) {
        await queryClient.invalidateQueries({ queryKey: ['admin-team-trainers', selectedTeam] });
        await queryClient.refetchQueries({ queryKey: ['admin-team-trainers', selectedTeam] });
      }
      setShowAssignTrainer(false);
      setSelectedTrainer('');
      showToast('Trainer erfolgreich zugewiesen', 'success');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (data: { teamId: number; userId: number }) =>
      adminAPI.removeUserFromTeam(data.teamId, data.userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
      await queryClient.refetchQueries({ queryKey: ['admin-teams'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      await queryClient.refetchQueries({ queryKey: ['admin-users'] });
      if (selectedTeam) {
        await queryClient.invalidateQueries({ queryKey: ['admin-team-trainers', selectedTeam] });
        await queryClient.refetchQueries({ queryKey: ['admin-team-trainers', selectedTeam] });
      }
      setShowRemoveTrainer(false);
      setSelectedTrainerToRemove('');
      showToast('Trainer erfolgreich entfernt', 'success');
    },
  });

  const deleteOrganizationMutation = useMutation({
    mutationFn: () => adminAPI.deleteOrganization(),
    onSuccess: () => {
      logout();
      window.location.href = '/';
    },
  });

  const createTrainerMutation = useMutation({
    mutationFn: (data: { name: string; teamIds: number[]; expiresInDays?: number }) =>
      adminAPI.createTrainerInvite(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-teams'] });
      await queryClient.refetchQueries({ queryKey: ['admin-teams'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      await queryClient.refetchQueries({ queryKey: ['admin-users'] });
    },
  });

  const createAdminMutation = useMutation({
    mutationFn: (data: { name: string; username: string; email: string; password: string }) =>
      adminAPI.createAdmin(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      await queryClient.refetchQueries({ queryKey: ['admin-users'] });
      closeCreateAdminModal();
      showToast('Admin erfolgreich erstellt', 'success');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.error || 'Admin konnte nicht erstellt werden', 'error');
    },
  });

  const handleUpdateSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettingsMutation.mutate({
      organizationName,
      organizationShortName: organizationShortName.trim() ? organizationShortName.trim() : null,
      timezone,
    });
  };

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size
      if (file.size > 5 * 1024 * 1024) {
        showToast('Datei ist zu groß. Maximale Größe: 5MB', 'warning');
        return;
      }
      
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        showToast('Ungültiger Dateityp. Erlaubt: JPG, PNG, GIF, WebP', 'warning');
        return;
      }
      
      uploadLogoMutation.mutate(file);
    }
  };

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    createTeamMutation.mutate({ name: teamName, description: teamDescription });
  };

  const handleDeleteTeam = (teamItem: any) => {
    setTeamToDelete(teamItem);
    setShowDeleteTeamConfirmModal(true);
  };

  const confirmDeleteTeam = async () => {
    if (!teamToDelete) return;
    try {
      await deleteTeamMutation.mutateAsync(teamToDelete.id);
      setShowDeleteTeamConfirmModal(false);
      setTeamToDelete(null);
      showToast('Team erfolgreich gelöscht', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.error || 'Team konnte nicht gelöscht werden', 'error');
    }
  };

  const handleAssignTrainer = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTeam && selectedTrainer) {
      addMemberMutation.mutate({
        teamId: selectedTeam,
        userId: parseInt(selectedTrainer),
        role: 'trainer',
      });
    }
  };

  const handleCreateTrainer = (e: React.FormEvent) => {
    e.preventDefault();
    setTrainerInviteLink('');
    setCopiedTrainerLink(false);
    createTrainerMutation.mutate({
      name: trainerName,
      teamIds: trainerTeamIds,
      expiresInDays: 7,
    }, {
      onSuccess: (response: any) => {
        setTrainerInviteLink(response.data.invite_url || '');
        setTrainerInviteMessageDraft('');
        setIsEditingTrainerInviteMessage(false);
      }
    });
  };

  const handleCreateAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    createAdminMutation.mutate({
      name: adminName.trim(),
      username: adminUsername.trim().toLowerCase(),
      email: adminEmail.trim().toLowerCase(),
      password: adminPassword,
    });
  };

  const handleRemoveTrainer = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTeam && selectedTrainerToRemove) {
      removeMemberMutation.mutate({
        teamId: selectedTeam,
        userId: parseInt(selectedTrainerToRemove),
      });
    }
  };

  const toggleTrainerTeam = (teamId: number) => {
    setTrainerTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const buildInviteMessage = (inviteeName: string, teamLabel: string, inviteUrl: string) => {
    const normalizedInviteeName = (inviteeName || 'Trainer').trim();
    const normalizedTeamLabel = (teamLabel || 'deines Teams').trim();
    const organizationLabel = String(settings?.name || 'dein Verein').trim();

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
      organizationLabel,
    ].join('\n');
  };

  const getSelectedTrainerTeamLabel = () => {
    const selectedTeamNames = (teams || [])
      .filter((team: any) => trainerTeamIds.includes(team.id))
      .map((team: any) => String(team.name || '').trim())
      .filter(Boolean);

    if (selectedTeamNames.length === 0) return 'deines Teams';
    return selectedTeamNames.join(' / ');
  };

  const handleCopyTrainerLink = async () => {
    if (!trainerInviteLink) return;
    const inviteMessage = (trainerInviteMessageDraft || buildInviteMessage(trainerName, getSelectedTrainerTeamLabel(), trainerInviteLink)).trim();
    const copied = await copyTextToClipboard(inviteMessage);
    if (!copied) {
      showToast('Einladungstext konnte nicht kopiert werden', 'error');
      return;
    }
    setCopiedTrainerLink(true);
    setTimeout(() => setCopiedTrainerLink(false), 2000);
    showToast('Einladungstext wurde in die Zwischenablage kopiert', 'info');
  };

  const closeCreateTrainerModal = () => {
    setShowCreateTrainer(false);
    setTrainerName('');
    setTrainerTeamIds([]);
    setTrainerInviteLink('');
    setTrainerInviteMessageDraft('');
    setIsEditingTrainerInviteMessage(false);
    setCopiedTrainerLink(false);
  };

  const closeCreateAdminModal = () => {
    setShowCreateAdmin(false);
    setAdminName('');
    setAdminUsername('');
    setAdminEmail('');
    setAdminPassword('');
  };

  const handleDeleteUser = (userItem: any) => {
    setUserToDelete(userItem);
    setShowDeleteUserConfirmModal(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      await deleteUserMutation.mutateAsync(userToDelete.id);
      setShowDeleteUserConfirmModal(false);
      setUserToDelete(null);
      showToast('Benutzer erfolgreich gelöscht', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.error || 'Benutzer konnte nicht gelöscht werden', 'error');
    }
  };

  const handleResendTrainerInvite = async (userItem: any) => {
    try {
      const response = await resendTrainerInviteMutation.mutateAsync(userItem.id);
      const inviteUrl = response?.data?.invite_url;

      if (!inviteUrl) {
        showToast('Einladungslink konnte nicht erstellt werden', 'error');
        return;
      }

      setResendTrainerName(userItem.name || 'Trainer');
      setResendTrainerTeams(String(userItem.team_names || '').trim());
      setResendTrainerLink(inviteUrl);
      setResendInviteMessageDraft('');
      setIsEditingResendInviteMessage(false);
      setCopiedResendTrainerLink(false);
      setShowResendTrainerLinkModal(true);
      showToast('Einladungslink erfolgreich neu erstellt', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.error || 'Einladungslink konnte nicht neu erstellt werden', 'error');
    }
  };

  const handleCopyResendTrainerLink = async () => {
    if (!resendTrainerLink) return;
    const inviteMessage = (resendInviteMessageDraft || buildInviteMessage(resendTrainerName, resendTrainerTeams || 'deines Teams', resendTrainerLink)).trim();
    const copied = await copyTextToClipboard(inviteMessage);
    if (!copied) {
      showToast('Einladungstext konnte nicht kopiert werden', 'error');
      return;
    }
    setCopiedResendTrainerLink(true);
    setTimeout(() => setCopiedResendTrainerLink(false), 2000);
    showToast('Einladungstext wurde in die Zwischenablage kopiert', 'info');
  };

  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    if (!text) return false;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_error) {
      // Fallback below
    }

    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.setAttribute('readonly', '');
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (_error) {
      return false;
    }
  };

  const handleResetUserPassword = async (userItem: any) => {
    setUserToResetPassword(userItem);
    setShowResetPasswordConfirmModal(true);
  };

  const confirmResetUserPassword = async () => {
    if (!userToResetPassword) return;

    try {
      const response = await resetUserPasswordMutation.mutateAsync(userToResetPassword.id);
      const generatedPassword = response?.data?.generatedPassword;

      if (!generatedPassword) {
        showToast('Passwort wurde zurückgesetzt, aber kein neues Passwort zurückgegeben', 'error');
        return;
      }

      setShowResetPasswordConfirmModal(false);
      setUserToResetPassword(null);
      setGeneratedPassword(generatedPassword);
      setCopiedGeneratedPassword(false);
      setShowGeneratedPasswordModal(true);
      showToast('Passwort erfolgreich zurückgesetzt', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.error || 'Passwort konnte nicht zurückgesetzt werden', 'error');
    }
  };

  const handleCopyGeneratedPassword = async () => {
    if (!generatedPassword) return;
    await navigator.clipboard.writeText(generatedPassword);
    setCopiedGeneratedPassword(true);
    setTimeout(() => setCopiedGeneratedPassword(false), 2000);
    showToast('Neues Passwort wurde in die Zwischenablage kopiert', 'info');
  };

  if (teamsLoading || usersLoading || settingsLoading) {
    return <div className="text-center py-12">Lädt...</div>;
  }

  const admins = users?.filter((u: any) => u.role === 'admin') || [];
  const trainers = users?.filter((u: any) => u.role === 'trainer') || [];
  const players = users?.filter((u: any) => u.role === 'player') || [];

  const normalizedTeamSearch = teamSearch.trim().toLowerCase();
  const normalizedAdminSearch = adminSearch.trim().toLowerCase();
  const normalizedTrainerSearch = trainerSearch.trim().toLowerCase();
  const normalizedPlayerSearch = playerSearch.trim().toLowerCase();

  const filteredTeams = (teams || []).filter((team: any) => {
    if (!normalizedTeamSearch) return true;
    const haystack = [team.name, team.description, team.trainer_names]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedTeamSearch);
  });

  const filteredTrainers = trainers.filter((trainer: any) => {
    if (!normalizedTrainerSearch) return true;
    const haystack = [trainer.name, trainer.username, trainer.email, trainer.team_names]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedTrainerSearch);
  });

  const filteredPlayers = players.filter((player: any) => {
    if (!normalizedPlayerSearch) return true;
    const haystack = [player.name, player.username, player.email, player.team_names]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedPlayerSearch);
  });

  const filteredAdmins = admins.filter((admin: any) => {
    if (!normalizedAdminSearch) return true;
    const haystack = [admin.name, admin.username, admin.email]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedAdminSearch);
  });

  const formatTrainerOptionLabel = (trainer: any) => {
    const isPending =
      trainer?.registration_status === 'pending' ||
      (typeof trainer?.email === 'string' && trainer.email.endsWith('@pending.local'));

    if (isPending) {
      return `${trainer.name} (Ausstehend)`;
    }

    return `${trainer.name} (${trainer.email})`;
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return '—';
    return new Date(value).toLocaleString('de-DE');
  };

  const formatRelativeTime = (value?: string | null) => {
    if (!value) return '—';
    const diffMs = Date.now() - new Date(value).getTime();
    if (Number.isNaN(diffMs) || diffMs < 0) return 'gerade eben';

    const minutes = Math.floor(diffMs / (1000 * 60));
    if (minutes < 1) return 'gerade eben';
    if (minutes < 60) return `vor ${minutes} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `vor ${hours} h`;

    const days = Math.floor(hours / 24);
    return `vor ${days} d`;
  };

  const formatAuditAction = (action: string) => {
    const actionMap: Record<string, string> = {
      user_deleted: 'Benutzer gelöscht',
      user_password_reset: 'Passwort zurückgesetzt',
      admin_created: 'Admin erstellt',
      trainer_assigned_to_team: 'Trainer zu Team zugewiesen',
      trainer_removed_from_team: 'Trainer aus Team entfernt',
      team_deleted: 'Team gelöscht',
    };
    return actionMap[action] || action;
  };

  const formatAuditDetailLabel = (key: string) => {
    const labels: Record<string, string> = {
      team_name: 'Team',
      target_name: 'Name',
      target_username: 'Benutzername',
      target_email: 'E-Mail',
      target_role: 'Rolle',
      trainer_name: 'Trainer',
      trainer_username: 'Trainer-Benutzername',
      trainer_email: 'Trainer-E-Mail',
      custom_password_provided: 'Manuelles Passwort',
    };
    return labels[key] || key;
  };

  const getStatusBadgeClasses = (variant: 'ok' | 'warning' | 'error') => {
    if (variant === 'ok') return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
    if (variant === 'warning') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
  };

  const getRegistrationBadge = (registrationStatus: string) => {
    if (registrationStatus === 'pending') {
      return { label: 'Ausstehend', className: getStatusBadgeClasses('warning') };
    }
    return { label: 'Registriert', className: getStatusBadgeClasses('ok') };
  };

  const auditActions: string[] = Array.from(
    new Set<string>((auditLogs || []).map((log: any) => String(log.action || '')).filter(Boolean))
  );

  const auditActors: Array<{ id: string; label: string }> = Array.from(
    new Map<string, { id: string; label: string }>(
      (auditLogs || []).map((log: any) => [
        String(log.actor_id),
        {
          id: String(log.actor_id),
          label: log.actor_name || log.actor_username || `#${log.actor_id}`,
        },
      ])
    ).values()
  );

  const getPeriodCutoffMs = () => {
    if (auditPeriodFilter === '24h') return Date.now() - 24 * 60 * 60 * 1000;
    if (auditPeriodFilter === '7d') return Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (auditPeriodFilter === '30d') return Date.now() - 30 * 24 * 60 * 60 * 1000;
    return null;
  };

  const filteredAuditLogs = (auditLogs || []).filter((log: any) => {
    if (auditActionFilter !== 'all' && log.action !== auditActionFilter) return false;
    if (auditActorFilter !== 'all' && String(log.actor_id) !== auditActorFilter) return false;

    const cutoff = getPeriodCutoffMs();
    if (cutoff) {
      const createdAtMs = new Date(log.created_at).getTime();
      if (Number.isNaN(createdAtMs) || createdAtMs < cutoff) return false;
    }

    return true;
  });

  const selectedAuditActor = auditActors.find((actor) => actor.id === auditActorFilter);

  const activeAuditFilterChips = [
    auditActionFilter !== 'all'
      ? {
          key: 'action',
          label: `Aktion: ${formatAuditAction(auditActionFilter)}`,
          clear: () => setAuditActionFilter('all'),
        }
      : null,
    auditActorFilter !== 'all'
      ? {
          key: 'actor',
          label: `Admin: ${selectedAuditActor?.label || auditActorFilter}`,
          clear: () => setAuditActorFilter('all'),
        }
      : null,
    auditPeriodFilter !== 'all'
      ? {
          key: 'period',
          label:
            auditPeriodFilter === '24h'
              ? 'Zeitraum: 24h'
              : auditPeriodFilter === '7d'
              ? 'Zeitraum: 7 Tage'
              : 'Zeitraum: 30 Tage',
          clear: () => setAuditPeriodFilter('all'),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; clear: () => void }>;

  const userTableHeadCellClass = 'px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase';
  const userTableCellClass = 'px-4 py-2 whitespace-nowrap';
  const userTableTextCellClass = 'px-4 py-2 text-sm text-gray-600 dark:text-gray-300';
  const userTableEmptyCellClass = 'px-4 py-3 text-sm text-gray-500 dark:text-gray-400';
  const userActionButtonClass = 'p-2 sm:p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const auditHeaderCellClass = 'py-1.5 pr-3';
  const auditCellClass = 'py-1.5 pr-3';
  const auditExpandedRowClass = 'py-2 px-2 bg-gray-50 dark:bg-gray-800';
  const tableSearchInputClass = 'input text-sm py-2';
  const trainerInviteMessageBase = trainerInviteLink
    ? buildInviteMessage(trainerName, getSelectedTrainerTeamLabel(), trainerInviteLink)
    : '';
  const trainerInviteMessage = trainerInviteMessageDraft || trainerInviteMessageBase;
  const resendInviteMessageBase = resendTrainerLink
    ? buildInviteMessage(resendTrainerName, resendTrainerTeams || 'deines Teams', resendTrainerLink)
    : '';
  const resendInviteMessage = resendInviteMessageDraft || resendInviteMessageBase;

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8 text-primary-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin-Panel</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">Team- und Benutzerverwaltung</p>
          </div>
        </div>
      </div>

      {/* Organization Settings */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <Settings className="w-6 h-6 mr-2 text-primary-600" />
            Vereins-Einstellungen
          </h2>
          <button
            onClick={() => setShowOrganizationSettings(!showOrganizationSettings)}
            className="btn btn-secondary text-sm w-full sm:w-auto"
          >
            {showOrganizationSettings ? 'Abbrechen' : 'Bearbeiten'}
          </button>
        </div>

        {showOrganizationSettings ? (
          <form onSubmit={handleUpdateSettings} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Vereinsname
              </label>
              <input
                type="text"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className="input"
                placeholder="z.B. SV Musterdorf"
                title="Vereinsname"
                aria-label="Vereinsname"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Kurzer Vereinsname (mobil)
              </label>
              <input
                type="text"
                value={organizationShortName}
                onChange={(e) => setOrganizationShortName(e.target.value)}
                className="input"
                placeholder="z.B. SVM"
                title="Kurzer Vereinsname"
                aria-label="Kurzer Vereinsname"
                maxLength={32}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Optional: Wird in der mobilen Navigation statt dem langen Namen verwendet.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Zeitzone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                title="Zeitzone auswählen"
                aria-label="Zeitzone auswählen"
                className="input"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={updateSettingsMutation.isPending}
              className="btn btn-primary"
            >
              {updateSettingsMutation.isPending ? 'Speichert...' : 'Speichern'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start space-x-4">
              {settings?.logo && (
                <div className="flex-shrink-0">
                  <img
                    src={resolveAssetUrl(settings.logo)}
                    alt="Vereinslogo"
                    className="w-24 h-24 rounded-lg object-contain bg-white border-2 border-gray-200 dark:border-gray-700 p-2"
                  />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Vereinsname:</span>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{settings?.name || 'Nicht festgelegt'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Kurzer Vereinsname:</span>
                  <p className="text-gray-900 dark:text-white">{settings?.short_name || 'Nicht festgelegt'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Zeitzone:</span>
                  <p className="text-gray-900 dark:text-white">{settings?.timezone || 'Europe/Berlin'}</p>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t dark:border-gray-700">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Vereinslogo {settings?.logo ? 'ändern' : 'hochladen'}
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Erlaubt: JPG, PNG, GIF, WebP (max. 5MB)
              </p>
              <input
                type="file"
                ref={logoFileInputRef}
                onChange={handleLogoFileSelect}
                accept="image/*"
                title="Vereinslogo auswählen"
                aria-label="Vereinslogo auswählen"
                className="hidden"
              />
              <button
                onClick={() => logoFileInputRef.current?.click()}
                disabled={uploadLogoMutation.isPending}
                className="btn btn-secondary flex items-center space-x-2"
              >
                <Upload className="w-4 h-4" />
                <span>{uploadLogoMutation.isPending ? 'Lädt hoch...' : settings?.logo ? 'Logo ändern' : 'Logo hochladen'}</span>
              </button>
              {uploadLogoMutation.isError && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                  Upload fehlgeschlagen. Bitte versuche es erneut.
                </p>
              )}
              {uploadLogoMutation.isSuccess && !uploadLogoMutation.isPending && (
                <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                  ✓ Logo erfolgreich hochgeladen!
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Workflow */}
      <div className="card border border-blue-200 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/30 py-3.5">
        <div className="mb-2.5">
          <div>
            <h2 className="text-base font-semibold text-blue-900 dark:text-blue-200">Workflow</h2>
            <p className="text-sm text-blue-900 dark:text-blue-200 mt-1 leading-snug">
              Kurzablauf: Admin organisiert Teams und Trainer, Trainer führen die Teamarbeit.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-white dark:bg-gray-900/70 p-2.5">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">Schritt 1</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white leading-snug">Team erstellen</p>
            <p className="text-xs text-gray-700 dark:text-gray-200 mt-1 leading-snug">Name und Beschreibung festlegen.</p>
          </div>

          <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-white dark:bg-gray-900/70 p-2.5">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">Schritt 2</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white leading-snug">Trainer zuweisen</p>
            <p className="text-xs text-gray-700 dark:text-gray-200 mt-1 leading-snug">Trainer pro Team hinzufügen oder ändern.</p>
          </div>

          <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-white dark:bg-gray-900/70 p-2.5">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">Schritt 3</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white leading-snug">Spieler durch Trainer pflegen</p>
            <p className="text-xs text-gray-700 dark:text-gray-200 mt-1 leading-snug">Trainer verwalten Spieler und Alltag im Team.</p>
          </div>
        </div>

        <p className="text-xs text-blue-900 dark:text-blue-200 mt-2.5 leading-snug">
          Hinweis: Der Admin ist organisatorisch zuständig und wird nicht als Teammitglied geführt.
        </p>
      </div>

      {/* Teams Section */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <Users className="w-6 h-6 mr-2 text-primary-600" />
            Alle Teams ({teams?.length || 0})
          </h2>
          <button
            onClick={() => setShowCreateTeam(!showCreateTeam)}
            className="btn btn-primary flex items-center justify-center space-x-2 w-full sm:w-auto"
          >
            <Plus className="w-5 h-5" />
            <span>Team erstellen</span>
          </button>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={teamSearch}
            onChange={(e) => setTeamSearch(e.target.value)}
            className={tableSearchInputClass}
            placeholder="Teams durchsuchen..."
            title="Teams durchsuchen"
            aria-label="Teams durchsuchen"
          />
        </div>
        
        <div className="space-y-2">
          {filteredTeams.map((team: any) => (
            <div key={team.id} className="p-3 bg-gray-50/80 border border-gray-200 rounded-md dark:bg-gray-800/60 dark:border-gray-700">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{team.name}</h3>
                  {team.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{team.description}</p>
                  )}
                  <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>👥 {team.member_count} Mitglieder</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    <span className="font-medium">Trainer:</span> {team.trainer_names || '-'}
                  </div>
                </div>
                
                <div className="flex space-x-1.5 sm:space-x-2 ml-2">
                  <button
                    onClick={() => {
                      setSelectedTeam(team.id);
                      setShowAssignTrainer(true);
                    }}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title="Trainer zuweisen"
                  >
                    <Shield className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setSelectedTeam(team.id);
                      setShowRemoveTrainer(true);
                    }}
                    className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-md transition-colors"
                    title="Trainer entfernen"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTeam(team)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Team löschen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredTeams.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p>{teams?.length ? 'Keine Teams gefunden' : 'Noch keine Teams erstellt'}</p>
              <div className="mt-3 flex justify-center gap-2">
                {teams?.length ? (
                  <button
                    type="button"
                    onClick={() => setTeamSearch('')}
                    className="btn btn-secondary text-sm"
                  >
                    Filter zurücksetzen
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCreateTeam(true)}
                    className="btn btn-primary text-sm"
                  >
                    Erstes Team erstellen
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Assign Trainer Modal */}
      {showAssignTrainer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="assign-trainer-title">
            <h3 id="assign-trainer-title" className="text-lg font-semibold mb-4 flex items-center">
              <Shield className="w-5 h-5 mr-2 text-blue-600" />
              Trainer zuweisen
            </h3>
            <form onSubmit={handleAssignTrainer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Trainer auswählen *
                </label>
                <select
                  autoFocus
                  required
                  value={selectedTrainer}
                  onChange={(e) => setSelectedTrainer(e.target.value)}
                  title="Trainer auswählen"
                  aria-label="Trainer auswählen"
                  className="input"
                >
                  <option value="">-- Trainer wählen --</option>
                  {users?.filter((u: any) => {
                    if (u.role !== 'trainer') return false;
                    const alreadyAssigned = (teamTrainers || []).some((trainer: any) => trainer.id === u.id);
                    return !alreadyAssigned;
                  }).map((user: any) => (
                    <option key={user.id} value={user.id}>
                      {formatTrainerOptionLabel(user)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={addMemberMutation.isPending}>
                  {addMemberMutation.isPending ? 'Weist zu...' : 'Zuweisen'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAssignTrainer(false);
                    setSelectedTrainer('');
                  }}
                  className="btn btn-secondary w-full sm:w-auto"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Team Confirm Modal */}
      {showDeleteTeamConfirmModal && teamToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="delete-team-title">
            <h3 id="delete-team-title" className="text-lg font-semibold mb-4">Team löschen</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Soll <strong>{teamToDelete.name}</strong> wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setShowDeleteTeamConfirmModal(false);
                  setTeamToDelete(null);
                }}
                className="btn btn-secondary w-full sm:w-auto"
                disabled={deleteTeamMutation.isPending}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={confirmDeleteTeam}
                className="btn bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto"
                disabled={deleteTeamMutation.isPending}
              >
                {deleteTeamMutation.isPending ? 'Löscht...' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Trainer Modal */}
      {showRemoveTrainer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="remove-trainer-title">
            <h3 id="remove-trainer-title" className="text-lg font-semibold mb-4 flex items-center">
              <UserMinus className="w-5 h-5 mr-2 text-orange-600" />
              Trainer entfernen
            </h3>
            <form onSubmit={handleRemoveTrainer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Trainer auswählen *
                </label>
                <select
                  autoFocus
                  required
                  value={selectedTrainerToRemove}
                  onChange={(e) => setSelectedTrainerToRemove(e.target.value)}
                  title="Trainer zum Entfernen auswählen"
                  aria-label="Trainer zum Entfernen auswählen"
                  className="input"
                >
                  <option value="">-- Trainer wählen --</option>
                  {teamTrainers?.map((trainer: any) => (
                    <option key={trainer.id} value={trainer.id}>
                      {formatTrainerOptionLabel(trainer)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={removeMemberMutation.isPending || !selectedTrainerToRemove}>
                  {removeMemberMutation.isPending ? 'Entfernt...' : 'Entfernen'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRemoveTrainer(false);
                    setSelectedTrainerToRemove('');
                  }}
                  className="btn btn-secondary w-full sm:w-auto"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users Section */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold">Benutzer ({users?.length || 0})</h2>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowCreateAdmin(true)}
              className="btn btn-secondary flex items-center justify-center space-x-2 w-full sm:w-auto"
            >
              <Shield className="w-4 h-4" />
              <span>Admin erstellen</span>
            </button>
            <button
              onClick={() => setShowCreateTrainer(!showCreateTrainer)}
              className="btn btn-primary flex items-center justify-center space-x-2 w-full sm:w-auto"
            >
              <UserPlus className="w-4 h-4" />
              <span>Trainer erstellen</span>
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3 text-violet-800 dark:text-violet-300">Admins ({admins.length})</h3>
            <div className="mb-3">
              <input
                type="text"
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
                className={tableSearchInputClass}
                placeholder="Admins durchsuchen..."
                title="Admins durchsuchen"
                aria-label="Admins durchsuchen"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[620px] sm:min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className={userTableHeadCellClass}>Name</th>
                    <th className={userTableHeadCellClass}>Benutzername</th>
                    <th className={userTableHeadCellClass}>Email</th>
                    <th className={userTableHeadCellClass}>Hinweis</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredAdmins.map((admin: any) => (
                    <tr key={admin.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className={userTableCellClass}>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{admin.name || '-'}</div>
                      </td>
                      <td className={userTableCellClass}>
                        <div className="text-sm text-gray-700 dark:text-gray-200">{admin.username || '-'}</div>
                      </td>
                      <td className={userTableCellClass}>
                        <div className="text-sm text-gray-600 dark:text-gray-300">{admin.email || '-'}</div>
                      </td>
                      <td className={userTableCellClass}>
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-violet-100 text-violet-800">
                          {user?.id === admin.id ? 'Du' : 'Admin'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredAdmins.length === 0 && (
                    <tr>
                      <td colSpan={4} className={userTableEmptyCellClass}>
                        <div className="flex flex-col gap-2 items-start">
                          <span>{admins.length ? 'Keine Admins gefunden.' : 'Keine Admins vorhanden.'}</span>
                          {admins.length > 0 && (
                            <button type="button" onClick={() => setAdminSearch('')} className="btn btn-secondary text-xs">
                              Filter zurücksetzen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3 text-blue-800 dark:text-blue-300">Trainer ({trainers.length})</h3>
            <div className="mb-3">
              <input
                type="text"
                value={trainerSearch}
                onChange={(e) => setTrainerSearch(e.target.value)}
                className={tableSearchInputClass}
                placeholder="Trainer durchsuchen..."
                title="Trainer durchsuchen"
                aria-label="Trainer durchsuchen"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[760px] sm:min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className={userTableHeadCellClass}>Name</th>
                    <th className={userTableHeadCellClass}>Benutzername</th>
                    <th className={userTableHeadCellClass}>Status</th>
                    <th className={userTableHeadCellClass}>Email</th>
                    <th className={userTableHeadCellClass}>Teams</th>
                    <th className={userTableHeadCellClass}>Aktionen</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredTrainers.map((user: any) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className={userTableCellClass}>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</div>
                      </td>
                      <td className={userTableCellClass}>
                        <div className="text-sm text-gray-700 dark:text-gray-200">
                          {user.registration_status === 'pending' ? 'Wird bei Registrierung gesetzt' : (user.username || '-')}
                        </div>
                      </td>
                      <td className={userTableCellClass}>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getRegistrationBadge(user.registration_status).className}`}>
                          {getRegistrationBadge(user.registration_status).label}
                        </span>
                      </td>
                      <td className={userTableCellClass}>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          {user.registration_status === 'pending' ? '-' : user.email}
                        </div>
                      </td>
                      <td className={userTableTextCellClass}>{user.team_names || '-'}</td>
                      <td className={userTableCellClass}>
                        <div className="flex items-center flex-wrap gap-1 sm:gap-2">
                          {user.registration_status === 'pending' && (
                            <button
                              onClick={() => handleResendTrainerInvite(user)}
                              disabled={resendTrainerInviteMutation.isPending}
                              className={`${userActionButtonClass} text-blue-600 hover:bg-blue-50`}
                              title="Link neu versenden"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleResetUserPassword(user)}
                            disabled={resetUserPasswordMutation.isPending}
                            className={`${userActionButtonClass} text-orange-600 hover:bg-orange-50`}
                            title="Passwort generieren & zurücksetzen"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            disabled={deleteUserMutation.isPending}
                            className={`${userActionButtonClass} text-red-600 hover:bg-red-50`}
                            title="Benutzer löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredTrainers.length === 0 && (
                    <tr>
                      <td colSpan={6} className={userTableEmptyCellClass}>
                        <div className="flex flex-col gap-2 items-start">
                          <span>{trainers.length ? 'Keine Trainer gefunden.' : 'Keine Trainer vorhanden.'}</span>
                          {trainers.length && (
                            <button type="button" onClick={() => setTrainerSearch('')} className="btn btn-secondary text-xs">
                              Filter zurücksetzen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3 text-green-800 dark:text-green-300">Spieler ({players.length})</h3>
            <div className="mb-3">
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                className={tableSearchInputClass}
                placeholder="Spieler durchsuchen..."
                title="Spieler durchsuchen"
                aria-label="Spieler durchsuchen"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[760px] sm:min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className={userTableHeadCellClass}>Name</th>
                    <th className={userTableHeadCellClass}>Benutzername</th>
                    <th className={userTableHeadCellClass}>Status</th>
                    <th className={userTableHeadCellClass}>Email</th>
                    <th className={userTableHeadCellClass}>Teams</th>
                    <th className={userTableHeadCellClass}>Aktionen</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredPlayers.map((user: any) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className={userTableCellClass}>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</div>
                      </td>
                      <td className={userTableCellClass}>
                        <div className="text-sm text-gray-700 dark:text-gray-200">
                          {user.registration_status === 'pending' ? 'Wird bei Registrierung gesetzt' : (user.username || '-')}
                        </div>
                      </td>
                      <td className={userTableCellClass}>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getRegistrationBadge(user.registration_status).className}`}>
                          {getRegistrationBadge(user.registration_status).label}
                        </span>
                      </td>
                      <td className={userTableCellClass}>
                        <div className="text-sm text-gray-600 dark:text-gray-300">{user.email}</div>
                      </td>
                      <td className={userTableTextCellClass}>{user.team_names || '-'}</td>
                      <td className={userTableCellClass}>
                        <div className="flex items-center flex-wrap gap-1 sm:gap-2">
                          <button
                            onClick={() => handleResetUserPassword(user)}
                            disabled={resetUserPasswordMutation.isPending}
                            className={`${userActionButtonClass} text-orange-600 hover:bg-orange-50`}
                            title="Passwort generieren & zurücksetzen"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user)}
                            disabled={deleteUserMutation.isPending}
                            className={`${userActionButtonClass} text-red-600 hover:bg-red-50`}
                            title="Benutzer löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredPlayers.length === 0 && (
                    <tr>
                      <td colSpan={6} className={userTableEmptyCellClass}>
                        <div className="flex flex-col gap-2 items-start">
                          <span>{players.length ? 'Keine Spieler gefunden.' : 'Keine Spieler vorhanden.'}</span>
                          {players.length && (
                            <button type="button" onClick={() => setPlayerSearch('')} className="btn btn-secondary text-xs">
                              Filter zurücksetzen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Log */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <Shield className="w-6 h-6 mr-2 text-primary-600" />
            Audit-Log Admin-Aktionen
          </h2>
          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
            <span className="text-xs text-gray-500 dark:text-gray-400">Auto-Refresh: 60s</span>
            <button
              type="button"
              onClick={() => refetchAuditLogs()}
              disabled={auditLogsFetching}
              className="btn btn-secondary text-xs"
            >
              {auditLogsFetching ? 'Aktualisiert...' : 'Aktualisieren'}
            </button>
          </div>
        </div>

        {auditLogsLoading ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">Audit-Log wird geladen...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                title="Aktionen filtern"
                aria-label="Aktionen filtern"
                className="input"
              >
                <option value="all">Alle Aktionen</option>
                {auditActions.map((action) => (
                  <option key={action} value={action}>
                    {formatAuditAction(action)}
                  </option>
                ))}
              </select>

              <select
                value={auditActorFilter}
                onChange={(e) => setAuditActorFilter(e.target.value)}
                title="Admins filtern"
                aria-label="Admins filtern"
                className="input"
              >
                <option value="all">Alle Admins</option>
                {auditActors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.label}
                  </option>
                ))}
              </select>

              <select
                value={auditPeriodFilter}
                onChange={(e) => setAuditPeriodFilter(e.target.value)}
                title="Zeitraum filtern"
                aria-label="Zeitraum filtern"
                className="input"
              >
                <option value="all">Gesamter Zeitraum</option>
                <option value="24h">Letzte 24 Stunden</option>
                <option value="7d">Letzte 7 Tage</option>
                <option value="30d">Letzte 30 Tage</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  setAuditActionFilter('all');
                  setAuditActorFilter('all');
                  setAuditPeriodFilter('all');
                }}
                className="btn btn-secondary w-full md:w-auto"
              >
                Filter zurücksetzen
              </button>
            </div>

            {activeAuditFilterChips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {activeAuditFilterChips.map((chip) => (
                  <span
                    key={chip.key}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {chip.label}
                    <button
                      type="button"
                      onClick={chip.clear}
                      className="text-blue-700 hover:text-blue-900"
                      aria-label={`${chip.label} entfernen`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="overflow-x-auto">
            <table className="min-w-[860px] sm:min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                  <th className={auditHeaderCellClass}>Zeitpunkt</th>
                  <th className={auditHeaderCellClass}>Admin</th>
                  <th className={auditHeaderCellClass}>Aktion</th>
                  <th className={auditHeaderCellClass}>Ziel</th>
                  <th className={auditHeaderCellClass}>Details</th>
                  <th className="py-1.5">Mehr</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuditLogs.map((log: any) => (
                  <Fragment key={log.id}>
                    <tr className="border-b dark:border-gray-800 align-top">
                      <td className={`${auditCellClass} whitespace-nowrap text-gray-700 dark:text-gray-200`}>
                        <div>{formatDateTime(log.created_at)}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{formatRelativeTime(log.created_at)}</div>
                      </td>
                      <td className={`${auditCellClass} text-gray-700 dark:text-gray-200`}>
                        {log.actor_name || log.actor_username || `#${log.actor_id}`}
                      </td>
                      <td className={`${auditCellClass} text-gray-900 dark:text-white font-medium`}>
                        {formatAuditAction(log.action)}
                      </td>
                      <td className={`${auditCellClass} text-gray-700 dark:text-gray-200`}>
                        {log.target_type ? `${log.target_type} #${log.target_id ?? '—'}` : '—'}
                      </td>
                      <td className={`${auditCellClass} text-gray-600 dark:text-gray-300`}>
                        {log.details?.team_name || log.details?.target_name || log.details?.trainer_name || '—'}
                      </td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          onClick={() => setExpandedAuditLogId((prev) => (prev === log.id ? null : log.id))}
                          className="btn btn-secondary text-xs"
                        >
                          {expandedAuditLogId === log.id ? 'Weniger' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {expandedAuditLogId === log.id && (
                      <tr className="border-b dark:border-gray-800">
                        <td colSpan={6} className={auditExpandedRowClass}>
                          {log.details && Object.keys(log.details).length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                              {Object.entries(log.details).map(([detailKey, detailValue]) => (
                                <div key={detailKey} className="text-gray-700 dark:text-gray-200">
                                  <span className="font-medium">{formatAuditDetailLabel(detailKey)}:</span>{' '}
                                  <span>{String(detailValue)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Keine zusätzlichen Details vorhanden.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {filteredAuditLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gray-500 dark:text-gray-400">
                      Keine Audit-Einträge für die gewählten Filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="card border-2 border-red-200 dark:border-red-900">
        <h2 className="text-xl font-semibold mb-2 text-red-700 dark:text-red-400">Gefahrenzone</h2>
        <p className="text-sm text-red-700 dark:text-red-300 mb-4">
          Verein löschen entfernt alle Teams, Benutzer, Einladungen, Termine und Uploads endgültig.
        </p>

        {!showDeleteOrganizationConfirm ? (
          <button
            onClick={() => setShowDeleteOrganizationConfirm(true)}
            className="btn bg-red-600 hover:bg-red-700 text-white"
          >
            Verein löschen
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Gib zur Bestätigung den Vereinsnamen ein: <strong>{settings?.name || 'Unbekannt'}</strong>
            </p>
            <input
              type="text"
              value={deleteOrganizationConfirmText}
              onChange={(e) => setDeleteOrganizationConfirmText(e.target.value)}
              className="input"
              placeholder="Vereinsname eingeben"
              title="Vereinsnamen zur Bestätigung eingeben"
              aria-label="Vereinsnamen zur Bestätigung eingeben"
            />
            <div className="flex gap-3">
              <button
                onClick={() => deleteOrganizationMutation.mutate()}
                disabled={
                  deleteOrganizationMutation.isPending ||
                  deleteOrganizationConfirmText.trim() !== (settings?.name || '')
                }
                className="btn bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteOrganizationMutation.isPending ? 'Löscht...' : 'Jetzt endgültig löschen'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteOrganizationConfirm(false);
                  setDeleteOrganizationConfirmText('');
                }}
                className="btn btn-secondary"
              >
                Abbrechen
              </button>
            </div>
            {deleteOrganizationMutation.isError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Löschen fehlgeschlagen. Bitte erneut versuchen.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Create Team Modal */}
      {showCreateTeam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="create-team-title">
            <h3 id="create-team-title" className="text-lg font-semibold mb-4">Neues Team erstellen</h3>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Team Name *</label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="input mt-1"
                  placeholder="z.B. FC Musterhausen U19"
                  title="Teamname"
                  aria-label="Teamname"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Beschreibung</label>
                <textarea
                  value={teamDescription}
                  onChange={(e) => setTeamDescription(e.target.value)}
                  className="input mt-1"
                  rows={3}
                  placeholder="Optionale Beschreibung..."
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={createTeamMutation.isPending}>
                  {createTeamMutation.isPending ? 'Erstellt...' : 'Team erstellen'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateTeam(false)}
                  className="btn btn-secondary w-full sm:w-auto"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Trainer Modal */}
      {showCreateAdmin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="create-admin-title">
            <h3 id="create-admin-title" className="text-lg font-semibold mb-4">Neuen Admin erstellen</h3>
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="input"
                  placeholder="z.B. Max Admin"
                  title="Admin Name"
                  aria-label="Admin Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Benutzername *</label>
                <input
                  type="text"
                  required
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="input"
                  placeholder="z.B. max_admin"
                  title="Admin Benutzername"
                  aria-label="Admin Benutzername"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">E-Mail *</label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="input"
                  placeholder="max.admin@example.com"
                  title="Admin E-Mail"
                  aria-label="Admin E-Mail"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Passwort *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="input"
                  placeholder="Mindestens 6 Zeichen"
                  title="Admin Passwort"
                  aria-label="Admin Passwort"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                <button
                  type="submit"
                  className="btn btn-primary w-full sm:w-auto"
                  disabled={createAdminMutation.isPending || !adminName.trim() || !adminUsername.trim() || !adminEmail.trim() || adminPassword.length < 6}
                >
                  {createAdminMutation.isPending ? 'Erstellt...' : 'Admin erstellen'}
                </button>
                <button
                  type="button"
                  onClick={closeCreateAdminModal}
                  className="btn btn-secondary w-full sm:w-auto"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Trainer Modal */}
      {showCreateTrainer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-xl w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="create-trainer-title">
            <h3 id="create-trainer-title" className="font-semibold text-gray-900 dark:text-white mb-4">Trainer anlegen & Registrierungslink erstellen</h3>

            <form onSubmit={handleCreateTrainer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={trainerName}
                  onChange={(e) => setTrainerName(e.target.value)}
                  className="input"
                  placeholder="z.B. Max Trainer"
                  title="Trainername"
                  aria-label="Trainername"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Teams zuweisen *</label>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-900">
                  {teams?.map((team: any) => (
                    <label key={team.id} className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={trainerTeamIds.includes(team.id)}
                        onChange={() => toggleTrainerTeam(team.id)}
                        title={`Team ${team.name} auswählen`}
                        aria-label={`Team ${team.name} auswählen`}
                      />
                      <span>{team.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Mindestens ein Team auswählen.</p>
              </div>

              {createTrainerMutation.isError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {(createTrainerMutation.error as any)?.response?.data?.error || 'Trainer-Link konnte nicht erstellt werden'}
                </p>
              )}

              {trainerInviteLink && (
                <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 space-y-2">
                  <p className="text-sm text-blue-800">Einladungstext für <strong>{trainerName}</strong>:</p>
                  <textarea
                    readOnly={!isEditingTrainerInviteMessage}
                    value={trainerInviteMessage}
                    onChange={(e) => setTrainerInviteMessageDraft(e.target.value)}
                    rows={9}
                    title="Einladungstext bearbeiten"
                    aria-label="Einladungstext bearbeiten"
                    className="input text-sm"
                  />
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isEditingTrainerInviteMessage) {
                          setTrainerInviteMessageDraft(trainerInviteMessageBase);
                          setIsEditingTrainerInviteMessage(true);
                          return;
                        }
                        setIsEditingTrainerInviteMessage(false);
                      }}
                      className="btn btn-secondary w-full sm:w-auto"
                    >
                      {isEditingTrainerInviteMessage ? 'Bearbeitung beenden' : 'Text bearbeiten'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyTrainerLink}
                      className="btn btn-secondary flex items-center justify-center space-x-2 w-full sm:w-auto"
                    >
                      {copiedTrainerLink ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedTrainerLink ? 'Kopiert' : 'Einladungstext kopieren'}</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
                {trainerInviteLink ? (
                  <button
                    type="button"
                    onClick={closeCreateTrainerModal}
                    className="btn bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                  >
                    Speichern
                  </button>
                ) : (
                  <>
                    <button
                      type="submit"
                      className="btn btn-primary w-full sm:w-auto"
                      disabled={createTrainerMutation.isPending || !trainerName.trim() || trainerTeamIds.length === 0}
                    >
                      {createTrainerMutation.isPending ? 'Erstellt...' : 'Link erstellen'}
                    </button>
                    <button
                      type="button"
                      onClick={closeCreateTrainerModal}
                      className="btn btn-secondary w-full sm:w-auto"
                    >
                      Abbrechen
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Confirm Modal */}
      {showResetPasswordConfirmModal && userToResetPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
            <h3 id="reset-password-title" className="text-lg font-semibold mb-4">Passwort zurücksetzen</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Soll das Passwort für <strong>{userToResetPassword.name}</strong> wirklich zurückgesetzt und neu generiert werden?
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setShowResetPasswordConfirmModal(false);
                  setUserToResetPassword(null);
                }}
                className="btn btn-secondary w-full sm:w-auto"
                disabled={resetUserPasswordMutation.isPending}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={confirmResetUserPassword}
                className="btn btn-primary w-full sm:w-auto"
                disabled={resetUserPasswordMutation.isPending}
              >
                {resetUserPasswordMutation.isPending ? 'Setzt zurück...' : 'Zurücksetzen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirm Modal */}
      {showDeleteUserConfirmModal && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="delete-user-title">
            <h3 id="delete-user-title" className="text-lg font-semibold mb-4">Benutzer löschen</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Soll <strong>{userToDelete.name}</strong> wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setShowDeleteUserConfirmModal(false);
                  setUserToDelete(null);
                }}
                className="btn btn-secondary w-full sm:w-auto"
                disabled={deleteUserMutation.isPending}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                className="btn bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto"
                disabled={deleteUserMutation.isPending}
              >
                {deleteUserMutation.isPending ? 'Löscht...' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resend Trainer Link Modal */}
      {showResendTrainerLinkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="resend-link-title">
            <h3 id="resend-link-title" className="text-lg font-semibold mb-4">Registrierungslink</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              Neuer Einladungstext für <strong>{resendTrainerName}</strong>:
            </p>
            <textarea
              autoFocus
              readOnly={!isEditingResendInviteMessage}
              value={resendInviteMessage}
              onChange={(e) => setResendInviteMessageDraft(e.target.value)}
              rows={9}
              title="Einladungstext für erneuten Versand"
              aria-label="Einladungstext für erneuten Versand"
              className="input mb-4 text-sm"
            />
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!isEditingResendInviteMessage) {
                    setResendInviteMessageDraft(resendInviteMessageBase);
                    setIsEditingResendInviteMessage(true);
                    return;
                  }
                  setIsEditingResendInviteMessage(false);
                }}
                className="btn btn-secondary w-full sm:w-auto"
              >
                {isEditingResendInviteMessage ? 'Bearbeitung beenden' : 'Text bearbeiten'}
              </button>
              <button
                type="button"
                onClick={handleCopyResendTrainerLink}
                className="btn btn-secondary flex items-center justify-center space-x-2 w-full sm:w-auto"
              >
                {copiedResendTrainerLink ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedResendTrainerLink ? 'Kopiert' : 'Einladungstext kopieren'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResendTrainerLinkModal(false);
                  setResendTrainerName('');
                  setResendTrainerTeams('');
                  setResendTrainerLink('');
                  setResendInviteMessageDraft('');
                  setIsEditingResendInviteMessage(false);
                  setCopiedResendTrainerLink(false);
                }}
                className="btn btn-primary w-full sm:w-auto"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generated Password Modal */}
      {showGeneratedPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="generated-password-title">
            <h3 id="generated-password-title" className="text-lg font-semibold mb-4">Neues Passwort</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              Das Passwort wurde zurückgesetzt. Teile dieses Passwort sicher mit dem Benutzer.
            </p>
            <input
              autoFocus
              readOnly
              value={generatedPassword}
              title="Generiertes Passwort"
              aria-label="Generiertes Passwort"
              className="input mb-4"
            />
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleCopyGeneratedPassword}
                className="btn btn-secondary flex items-center justify-center space-x-2 w-full sm:w-auto"
              >
                {copiedGeneratedPassword ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedGeneratedPassword ? 'Kopiert' : 'Passwort kopieren'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowGeneratedPasswordModal(false);
                  setGeneratedPassword('');
                  setCopiedGeneratedPassword(false);
                }}
                className="btn btn-primary w-full sm:w-auto"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
