import { useEffect, useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsAPI, profileAPI, settingsAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { User, Lock, Camera, Trash2, Check, AlertCircle, Edit2, Bell } from 'lucide-react';
import { useToast } from '../lib/useToast';
import { resolveAssetUrl } from '../lib/utils';
import {
  getNotificationPermission,
  getBrowserPushSubscription,
  isPushSupported,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
} from '../lib/pushNotifications';

export default function SettingsPage() {
  const { user: authUser } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [nickname, setNickname] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [clothingSize, setClothingSize] = useState('');
  const [shoeSize, setShoeSize] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [footedness, setFootedness] = useState('');
  const [position, setPosition] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDeletePictureConfirmModal, setShowDeletePictureConfirmModal] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [customTeamNames, setCustomTeamNames] = useState<Record<number, string>>({});
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const response = await profileAPI.getProfile();
      return response.data;
    },
  });

  const {
    data: trainerTeams,
    isLoading: isTrainerTeamsLoading,
    isError: isTrainerTeamsError,
  } = useQuery({
    queryKey: ['trainer-team-names'],
    queryFn: async () => {
      const response = await settingsAPI.getTrainerTeamNames();
      return response.data;
    },
    enabled: authUser?.role === 'trainer',
  });

  const {
    data: pushStatus,
    isLoading: isPushStatusLoading,
  } = useQuery({
    queryKey: ['push-status'],
    queryFn: async () => {
      const response = await notificationsAPI.getStatus();
      return response.data as { configured: boolean; subscribed: boolean };
    },
    enabled: Boolean(authUser),
  });

  const pushSupported = isPushSupported();

  useEffect(() => {
    if (trainerTeams) {
      const namesMap = trainerTeams.reduce((acc: Record<number, string>, team: any) => {
        acc[team.id] = team.trainer_custom_team_name || '';
        return acc;
      }, {});
      setCustomTeamNames(namesMap);
    }
  }, [trainerTeams]);

  const updatePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      profileAPI.updatePassword(data),
    onSuccess: () => {
      setPasswordMessage({ type: 'success', text: 'Passwort erfolgreich geändert!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordMessage(null), 5000);
    },
    onError: (error: any) => {
      setPasswordMessage({
        type: 'error',
        text: error.response?.data?.error || 'Fehler beim Ändern des Passworts',
      });
      setTimeout(() => setPasswordMessage(null), 5000);
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: {
      phone_number?: string;
      nickname?: string;
      height_cm?: number | null;
      weight_kg?: number | null;
      clothing_size?: string | null;
      shoe_size?: string | null;
      jersey_number?: number | null;
      footedness?: string | null;
      position?: string | null;
    }) => profileAPI.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      showToast('Profil gespeichert', 'success');
    },
    onError: (error: any) => {
      showToast(error.response?.data?.error || 'Profil konnte nicht gespeichert werden', 'error');
    },
  });

  const uploadPictureMutation = useMutation({
    mutationFn: (file: File) => profileAPI.uploadPicture(file),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      showToast('Profilbild erfolgreich hochgeladen', 'success');
      // Update auth store with new profile picture
      if (authUser) {
        const updatedUser = { ...authUser, profile_picture: response.data.profile_picture };
        const token = localStorage.getItem('auth-token');
        if (token) {
          localStorage.setItem('auth-user', JSON.stringify(updatedUser));
          window.location.reload(); // Reload to update navigation
        }
      }
    },
    onError: () => {
      showToast('Profilbild konnte nicht hochgeladen werden', 'error');
    },
  });

  const deletePictureMutation = useMutation({
    mutationFn: () => profileAPI.deletePicture(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      showToast('Profilbild erfolgreich entfernt', 'success');
      // Update auth store - remove profile picture
      if (authUser) {
        const updatedUser = { ...authUser, profile_picture: undefined };
        const token = localStorage.getItem('auth-token');
        if (token) {
          localStorage.setItem('auth-user', JSON.stringify(updatedUser));
          window.location.reload(); // Reload to update navigation
        }
      }
    },
    onError: () => {
      showToast('Profilbild konnte nicht entfernt werden', 'error');
    },
  });

  const updateTrainerTeamNameMutation = useMutation({
    mutationFn: ({ teamId, customName }: { teamId: number; customName: string | null }) =>
      settingsAPI.updateTrainerTeamName(teamId, customName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainer-team-names'] });
      showToast('Teamname gespeichert', 'success');
      setEditingTeamId(null);
    },
    onError: (error: any) => {
      showToast(error.response?.data?.error || 'Teamname konnte nicht gespeichert werden', 'error');
    },
  });

  const enablePushMutation = useMutation({
    mutationFn: async () => {
      const keyResponse = await notificationsAPI.getPublicKey();
      const publicKey = String(keyResponse?.data?.publicKey || '').trim();
      if (!publicKey) {
        throw new Error('VAPID Public Key fehlt auf dem Server.');
      }

      const subscription = await subscribeBrowserPush(publicKey);
      const subscriptionJson = subscription.toJSON();
      const endpoint = String(subscriptionJson.endpoint || '').trim();
      const p256dh = String(subscriptionJson.keys?.p256dh || '').trim();
      const auth = String(subscriptionJson.keys?.auth || '').trim();

      if (!endpoint || !p256dh || !auth) {
        throw new Error('Ungültige Push-Subscription vom Browser.');
      }

      await notificationsAPI.subscribe({
        endpoint,
        expirationTime: subscription.expirationTime,
        keys: { p256dh, auth },
      });

      return subscription;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-status'] });
      setPushPermission(getNotificationPermission());
      showToast('Push-Benachrichtigungen aktiviert', 'success');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Push konnte nicht aktiviert werden';
      showToast(message, 'error');
      setPushPermission(getNotificationPermission());
    },
  });

  const disablePushMutation = useMutation({
    mutationFn: async () => {
      const existingSubscription = await getBrowserPushSubscription();
      const endpoint = String(existingSubscription?.endpoint || '').trim();

      // Always clean server-side subscriptions, even if local subscription is missing.
      await notificationsAPI.unsubscribe(endpoint);

      try {
        await unsubscribeBrowserPush();
      } catch {
        // Server-side cleanup is the primary source of truth for push status.
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-status'] });
      setPushPermission(getNotificationPermission());
      showToast('Push-Benachrichtigungen deaktiviert', 'success');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Push konnte nicht deaktiviert werden';
      showToast(message, 'error');
    },
  });

  const sendTestPushMutation = useMutation({
    mutationFn: () => notificationsAPI.sendTest({
      title: 'teamvote+ Test',
      body: 'Push funktioniert auf diesem Gerät.',
      url: '/events',
    }),
    onSuccess: () => {
      showToast('Test-Benachrichtigung wurde gesendet', 'success');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Test-Benachrichtigung konnte nicht gesendet werden';
      showToast(message, 'error');
    },
  });

  useEffect(() => {
    if (!pushSupported) {
      return;
    }

    setPushPermission(getNotificationPermission());
  }, [pushSupported]);

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Das neue Passwort muss mindestens 6 Zeichen lang sein' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Die Passwörter stimmen nicht überein' });
      return;
    }

    updatePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        showToast('Die Datei ist zu groß. Maximale Größe: 5MB', 'warning');
        return;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        showToast('Bitte wähle eine Bilddatei aus', 'warning');
        return;
      }

      uploadPictureMutation.mutate(file);
    }
  };

  const handleDeletePicture = () => {
    setShowDeletePictureConfirmModal(true);
  };

  const confirmDeletePicture = () => {
    deletePictureMutation.mutate(undefined, {
      onSettled: () => {
        setShowDeletePictureConfirmModal(false);
      },
    });
  };

  const profilePictureUrl = resolveAssetUrl(profile?.profile_picture) || null;

  useEffect(() => {
    if (typeof profile?.phone_number === 'string') {
      setPhoneNumber(profile.phone_number);
    } else {
      setPhoneNumber('');
    }
  }, [profile?.phone_number]);

  useEffect(() => {
    if (typeof profile?.nickname === 'string') {
      setNickname(profile.nickname);
    } else {
      setNickname('');
    }
  }, [profile?.nickname]);

  useEffect(() => {
    if (typeof profile?.height_cm === 'number') {
      setHeightCm(String(profile.height_cm));
    } else {
      setHeightCm('');
    }
  }, [profile?.height_cm]);

  useEffect(() => {
    if (typeof profile?.weight_kg === 'number') {
      setWeightKg(String(profile.weight_kg));
    } else {
      setWeightKg('');
    }
  }, [profile?.weight_kg]);

  useEffect(() => {
    if (typeof profile?.clothing_size === 'string') {
      setClothingSize(profile.clothing_size);
    } else {
      setClothingSize('');
    }
  }, [profile?.clothing_size]);

  useEffect(() => {
    if (typeof profile?.shoe_size === 'string') {
      setShoeSize(profile.shoe_size);
    } else {
      setShoeSize('');
    }
  }, [profile?.shoe_size]);

  useEffect(() => {
    if (typeof profile?.jersey_number === 'number') {
      setJerseyNumber(String(profile.jersey_number));
    } else {
      setJerseyNumber('');
    }
  }, [profile?.jersey_number]);

  useEffect(() => {
    if (typeof profile?.footedness === 'string') {
      setFootedness(profile.footedness);
    } else {
      setFootedness('');
    }
  }, [profile?.footedness]);

  useEffect(() => {
    if (typeof profile?.position === 'string') {
      setPosition(profile.position);
    } else {
      setPosition('');
    }
  }, [profile?.position]);

  const handlePhoneNumberSave = () => {
    updateProfileMutation.mutate({ phone_number: phoneNumber });
  };

  const handleNicknameSave = () => {
    updateProfileMutation.mutate({ nickname });
  };

  const parseNumberOrNull = (value: string): number | null => {
    const normalized = value.trim();
    if (!normalized) return null;
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handlePlayerProfileSave = () => {
    updateProfileMutation.mutate({
      height_cm: parseNumberOrNull(heightCm),
      weight_kg: parseNumberOrNull(weightKg),
      clothing_size: clothingSize.trim() ? clothingSize.trim() : null,
      shoe_size: shoeSize.trim() ? shoeSize.trim() : null,
      jersey_number: parseNumberOrNull(jerseyNumber),
      footedness: footedness.trim() ? footedness.trim().toLowerCase() : null,
      position: position.trim() ? position.trim() : null,
    });
  };

  const handleEnablePush = () => {
    enablePushMutation.mutate();
  };

  const handleDisablePush = () => {
    disablePushMutation.mutate();
  };

  const handleSendTestPush = () => {
    sendTestPushMutation.mutate();
  };

  const isPushConfigured = Boolean(pushStatus?.configured);
  const isPushSubscribed = Boolean(pushStatus?.subscribed);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start sm:items-center gap-3">
        <User className="w-8 h-8 text-primary-600" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Einstellungen</h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-1">Verwalte dein Profil und deine Einstellungen</p>
        </div>
      </div>

      {/* Profile Picture Section */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Camera className="w-6 h-6 mr-2 text-primary-600" />
          Profilbild
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="relative">
            {profilePictureUrl ? (
              <img
                src={profilePictureUrl}
                alt="Profilbild"
                className="w-32 h-32 rounded-full object-cover border-4 border-gray-600"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-gray-700 flex items-center justify-center border-4 border-gray-600">
                <User className="w-16 h-16 text-gray-300" />
              </div>
            )}
            {uploadPictureMutation.isPending && (
              <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3 w-full">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Erlaubte Formate: JPG, PNG, GIF, WebP (max. 5MB)
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                title="Profilbild auswählen"
                aria-label="Profilbild auswählen"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadPictureMutation.isPending}
                className="btn btn-primary w-full sm:w-auto"
              >
                {profilePictureUrl ? 'Bild ändern' : 'Bild hochladen'}
              </button>
              {profilePictureUrl && (
                <button
                  onClick={handleDeletePicture}
                  disabled={deletePictureMutation.isPending}
                  className="btn btn-secondary flex items-center justify-center space-x-2 w-full sm:w-auto"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Entfernen</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Profile Information */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <User className="w-6 h-6 mr-2 text-primary-600" />
          Profil-Informationen
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Benutzername
            </label>
            <div className="mt-1 text-gray-900 dark:text-white font-medium">{profile?.username || authUser?.username}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Spitzname
            </label>
            <div className="mt-1 flex flex-col sm:flex-row gap-2 sm:gap-3">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="input"
                placeholder="z. B. Kalle"
                maxLength={40}
              />
              <button
                type="button"
                onClick={handleNicknameSave}
                disabled={updateProfileMutation.isPending}
                className="btn btn-primary w-full sm:w-auto"
              >
                {updateProfileMutation.isPending ? 'Speichert...' : 'Speichern'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name
            </label>
            <div className="mt-1 text-gray-900 dark:text-white font-medium">{profile?.name || authUser?.name}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              E-Mail
            </label>
            <div className="mt-1 text-gray-900 dark:text-white">{profile?.email || authUser?.email}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Rolle
            </label>
            <div className="mt-1">
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                authUser?.role === 'admin'
                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200'
                  : authUser?.role === 'trainer'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                  : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
              }`}>
                {authUser?.role === 'admin' ? 'Administrator' : authUser?.role === 'trainer' ? 'Trainer' : 'Spieler'}
              </span>
            </div>
          </div>

          {authUser?.role === 'trainer' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Handynummer
              </label>
              <div className="mt-1 flex flex-col sm:flex-row gap-2 sm:gap-3">
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="input"
                  placeholder="z. B. +49 170 1234567"
                  maxLength={30}
                />
                <button
                  type="button"
                  onClick={handlePhoneNumberSave}
                  disabled={updateProfileMutation.isPending}
                  className="btn btn-primary w-full sm:w-auto"
                >
                  {updateProfileMutation.isPending ? 'Speichert...' : 'Speichern'}
                </button>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Nur für Trainer-Info sichtbar in deinem Profil.
              </p>
            </div>
          )}

          {authUser?.role !== 'admin' && authUser?.role !== 'trainer' && (
            <div className="space-y-4 pt-2">
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Spielerprofil</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Größe (cm)</label>
                    <input
                      type="number"
                      min={100}
                      max={250}
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      className="input mt-1"
                      placeholder="z. B. 182"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Gewicht (kg)</label>
                    <input
                      type="number"
                      min={30}
                      max={250}
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      className="input mt-1"
                      placeholder="z. B. 76"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Kleidergröße</label>
                    <input
                      type="text"
                      value={clothingSize}
                      onChange={(e) => setClothingSize(e.target.value)}
                      className="input mt-1"
                      placeholder="z. B. M"
                      maxLength={20}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Schuhgröße</label>
                    <input
                      type="text"
                      value={shoeSize}
                      onChange={(e) => setShoeSize(e.target.value)}
                      className="input mt-1"
                      placeholder="z. B. 43"
                      maxLength={20}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Trikotnummer</label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={jerseyNumber}
                      onChange={(e) => setJerseyNumber(e.target.value)}
                      className="input mt-1"
                      placeholder="z. B. 10"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Füßigkeit</label>
                    <div className="mt-1 grid grid-cols-3 gap-2" role="group" aria-label="Füßigkeit auswählen">
                      {[
                        { value: 'links', label: 'Links' },
                        { value: 'rechts', label: 'Rechts' },
                        { value: 'beidfüßig', label: 'Beidfüßig' },
                      ].map((option) => {
                        const isActive = footedness === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setFootedness(isActive ? '' : option.value)}
                            className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                              isActive
                                ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/30 dark:text-primary-200'
                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Position</label>
                    <input
                      type="text"
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      className="input mt-1"
                      placeholder="z. B. Zentrales Mittelfeld"
                      maxLength={40}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handlePlayerProfileSave}
                    disabled={updateProfileMutation.isPending}
                    className="btn btn-primary w-full sm:w-auto"
                  >
                    {updateProfileMutation.isPending ? 'Speichert...' : 'Spielerprofil speichern'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Trainer Team Names Section */}
      {authUser?.role === 'trainer' && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Edit2 className="w-6 h-6 mr-2 text-primary-600" />
            Meine Teamnamen
          </h2>

          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Gib jedem Team einen persönlichen Namen, um es leichter zu unterscheiden.
          </p>

          {isTrainerTeamsLoading && (
            <p className="text-sm text-gray-600 dark:text-gray-300">Teams werden geladen...</p>
          )}

          {isTrainerTeamsError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Teamnamen konnten nicht geladen werden. Bitte Seite neu laden.
            </p>
          )}

          {!isTrainerTeamsLoading && !isTrainerTeamsError && (!trainerTeams || trainerTeams.length === 0) && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Du bist aktuell keinem Team als Trainer zugeordnet.
            </p>
          )}

          {!isTrainerTeamsLoading && !isTrainerTeamsError && trainerTeams && trainerTeams.length > 0 && (
            <div className="space-y-3">
              {trainerTeams.map((team: any) => (
                <div key={team.id} className="flex items-center gap-3 p-3 border border-gray-300 dark:border-gray-600 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{team.name}</p>
                    {editingTeamId === team.id ? (
                      <input
                        type="text"
                        value={customTeamNames[team.id] || ''}
                        onChange={(e) =>
                          setCustomTeamNames({
                            ...customTeamNames,
                            [team.id]: e.target.value,
                          })
                        }
                        placeholder="z.B. Mein U19 Team"
                        className="input mt-2"
                        autoFocus
                      />
                    ) : (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {customTeamNames[team.id]
                          ? `Mein Name: ${customTeamNames[team.id]}`
                          : 'Kein persönlicher Name gesetzt'}
                      </p>
                    )}
                  </div>

                  {editingTeamId === team.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          updateTrainerTeamNameMutation.mutate({
                            teamId: team.id,
                            customName: customTeamNames[team.id] || null,
                          });
                        }}
                        disabled={updateTrainerTeamNameMutation.isPending}
                        className="btn btn-sm btn-primary"
                      >
                        {updateTrainerTeamNameMutation.isPending ? 'Speichert...' : 'Speichern'}
                      </button>
                      <button
                        onClick={() => setEditingTeamId(null)}
                        className="btn btn-sm btn-secondary"
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingTeamId(team.id)}
                      className="btn btn-sm btn-secondary"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Bell className="w-6 h-6 mr-2 text-primary-600" />
          Benachrichtigungen (PWA)
        </h2>

        {!pushSupported ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Dieser Browser unterstützt keine Web-Push-Benachrichtigungen.
          </p>
        ) : !isPushConfigured && !isPushStatusLoading ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Push ist auf dem Server noch nicht konfiguriert. Bitte VAPID-Keys in der Backend-Umgebung setzen.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-gray-700 dark:text-gray-200 space-y-1">
              <p>
                Status: <span className={isPushSubscribed ? 'text-green-600 dark:text-green-400 font-medium' : 'text-gray-700 dark:text-gray-300'}>{isPushSubscribed ? 'Aktiv' : 'Inaktiv'}</span>
              </p>
              <p>
                Berechtigung: <span className="font-medium">{pushPermission === 'granted' ? 'Erlaubt' : pushPermission === 'denied' ? 'Blockiert' : 'Noch nicht gefragt'}</span>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              {!isPushSubscribed ? (
                <button
                  type="button"
                  onClick={handleEnablePush}
                  disabled={enablePushMutation.isPending || !isPushConfigured}
                  className="btn btn-primary w-full sm:w-auto"
                >
                  {enablePushMutation.isPending ? 'Aktiviert...' : 'Benachrichtigungen aktivieren'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDisablePush}
                  disabled={disablePushMutation.isPending}
                  className="btn btn-secondary w-full sm:w-auto"
                >
                  {disablePushMutation.isPending ? 'Deaktiviert...' : 'Benachrichtigungen deaktivieren'}
                </button>
              )}

              <button
                type="button"
                onClick={handleSendTestPush}
                disabled={!isPushSubscribed || sendTestPushMutation.isPending}
                className="btn btn-secondary w-full sm:w-auto"
              >
                {sendTestPushMutation.isPending ? 'Sendet...' : 'Test senden'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Change Password Section */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Lock className="w-6 h-6 mr-2 text-primary-600" />
          Passwort ändern
        </h2>

        {passwordMessage && (
          <div
            className={`mb-4 p-4 rounded-lg flex items-start space-x-3 ${
              passwordMessage.type === 'success'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            {passwordMessage.type === 'success' ? (
              <Check className="w-5 h-5 text-green-600 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            )}
            <p
              className={`text-sm ${
                passwordMessage.type === 'success' ? 'text-green-800' : 'text-red-800'
              }`}
            >
              {passwordMessage.text}
            </p>
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Aktuelles Passwort
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input mt-1"
              placeholder="Aktuelles Passwort eingeben"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Neues Passwort
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input mt-1"
              placeholder="Mindestens 6 Zeichen"
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Neues Passwort bestätigen
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input mt-1"
              placeholder="Neues Passwort wiederholen"
            />
          </div>

          <button
            type="submit"
            disabled={updatePasswordMutation.isPending}
            className="btn btn-primary w-full sm:w-auto"
          >
            {updatePasswordMutation.isPending ? 'Wird gespeichert...' : 'Passwort ändern'}
          </button>
        </form>
      </div>

      {showDeletePictureConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Profilbild löschen?</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Möchtest du dein Profilbild wirklich dauerhaft entfernen?
            </p>

            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setShowDeletePictureConfirmModal(false)}
                disabled={deletePictureMutation.isPending}
                className="btn btn-secondary w-full sm:w-auto"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={confirmDeletePicture}
                disabled={deletePictureMutation.isPending}
                className="btn bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto"
              >
                {deletePictureMutation.isPending ? 'Löscht...' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
