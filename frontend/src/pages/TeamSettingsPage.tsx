import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Settings, SlidersHorizontal, ChevronDown, ChevronUp, Edit2 } from 'lucide-react';
import { teamsAPI, settingsAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useToast } from '../lib/useToast';
import { resolveAssetUrl } from '../lib/utils';
import { useSmartBack } from '../hooks/useSmartBack';

export default function TeamSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const teamId = parseInt(id || '', 10);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const goBack = useSmartBack();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fussballDeId, setFussballDeId] = useState('');
  const [fussballDeTeamName, setFussballDeTeamName] = useState('');
  const [showDeleteImportedGamesConfirm, setShowDeleteImportedGamesConfirm] = useState(false);
  const [defaultResponse, setDefaultResponse] = useState<'pending' | 'accepted' | 'tentative' | 'declined'>('pending');
  const [defaultRsvpDeadlineHoursTraining, setDefaultRsvpDeadlineHoursTraining] = useState('');
  const [defaultRsvpDeadlineDaysMatch, setDefaultRsvpDeadlineDaysMatch] = useState('');
  const [defaultRsvpDeadlineHoursOther, setDefaultRsvpDeadlineHoursOther] = useState('');
  const [defaultArrivalMinutesTraining, setDefaultArrivalMinutesTraining] = useState('');
  const [defaultArrivalMinutesMatch, setDefaultArrivalMinutesMatch] = useState('');
  const [homeVenues, setHomeVenues] = useState<Array<{ name: string; street: string; zip_city: string; pitch_type: string }>>([]);
  const [defaultHomeVenueName, setDefaultHomeVenueName] = useState('');
  const [expandedHomeVenueIndex, setExpandedHomeVenueIndex] = useState<number | null>(null);
  const [customTeamName, setCustomTeamName] = useState('');
  const [showDeleteTeamConfirm, setShowDeleteTeamConfirm] = useState(false);

  const pitchTypeOptions: Array<{ value: string; label: string }> = [
    { value: 'Rasen', label: 'Rasen' },
    { value: 'Kunstrasen', label: 'Kunstrasen' },
    { value: 'Halle', label: 'Halle' },
    { value: 'Sonstiges', label: 'Sonstiges' },
  ];

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['team-settings', teamId],
    queryFn: async () => {
      const response = await teamsAPI.getSettings(teamId);
      return response.data;
    },
    enabled: Number.isFinite(teamId),
    retry: false,
  });

  const { data: team } = useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const response = await teamsAPI.getById(teamId);
      return response.data;
    },
    enabled: Number.isFinite(teamId),
  });

  const { data: trainerTeams } = useQuery({
    queryKey: ['trainer-team-names'],
    queryFn: async () => {
      const response = await settingsAPI.getTrainerTeamNames();
      return response.data;
    },
    enabled: Number.isFinite(teamId),
  });

  useEffect(() => {
    if (!Array.isArray(trainerTeams)) {
      return;
    }

    const currentTeam = trainerTeams.find((entry: any) => Number(entry.id) === teamId);
    setCustomTeamName(String(currentTeam?.trainer_custom_team_name || ''));
  }, [trainerTeams, teamId]);

  useEffect(() => {
    if (!settings) return;
    const idsFromSettings = Array.isArray((settings as any).fussballde_ids)
      ? (settings as any).fussballde_ids
      : [];
    setFussballDeId(idsFromSettings.length > 0 ? idsFromSettings.join('\n') : (settings.fussballde_id || ''));
    const teamNamesFromSettings = Array.isArray((settings as any).fussballde_team_names)
      ? (settings as any).fussballde_team_names
      : [];
    setFussballDeTeamName(teamNamesFromSettings.length > 0 ? teamNamesFromSettings.join('\n') : (settings.fussballde_team_name || ''));
    setDefaultResponse((settings.default_response || 'pending') as 'pending' | 'accepted' | 'tentative' | 'declined');
    const legacyDefault =
      settings.default_rsvp_deadline_hours === null || settings.default_rsvp_deadline_hours === undefined
        ? null
        : String(settings.default_rsvp_deadline_hours);
    setDefaultRsvpDeadlineHoursTraining(
      settings.default_rsvp_deadline_hours_training === null || settings.default_rsvp_deadline_hours_training === undefined
        ? (legacyDefault ?? '')
        : String(settings.default_rsvp_deadline_hours_training)
    );
    setDefaultRsvpDeadlineDaysMatch(
      settings.default_rsvp_deadline_hours_match === null || settings.default_rsvp_deadline_hours_match === undefined
        ? (legacyDefault ?? '')
        : String(Math.max(0, Math.round(Number(settings.default_rsvp_deadline_hours_match) / 24)))
    );
    setDefaultRsvpDeadlineHoursOther(
      settings.default_rsvp_deadline_hours_other === null || settings.default_rsvp_deadline_hours_other === undefined
        ? (legacyDefault ?? '')
        : String(settings.default_rsvp_deadline_hours_other)
    );
    setDefaultArrivalMinutesTraining(
      settings.default_arrival_minutes_training === null || settings.default_arrival_minutes_training === undefined
        ? (
          settings.default_arrival_minutes === null || settings.default_arrival_minutes === undefined
            ? ''
            : String(settings.default_arrival_minutes)
        )
        : String(settings.default_arrival_minutes_training)
    );
    setDefaultArrivalMinutesMatch(
      settings.default_arrival_minutes_match === null || settings.default_arrival_minutes_match === undefined
        ? ''
        : String(settings.default_arrival_minutes_match)
    );
    setHomeVenues(
      Array.isArray(settings.home_venues)
        ? settings.home_venues.map((venue: any) => ({
            name: String(venue?.name || ''),
            street: String(venue?.street || ''),
            zip_city: String(venue?.zip_city || ''),
            pitch_type: String(venue?.pitch_type || ''),
          }))
        : []
    );
    setDefaultHomeVenueName(String(settings.default_home_venue_name || ''));
  }, [settings]);

  const invalidateSettingsQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['team', teamId] });
    queryClient.invalidateQueries({ queryKey: ['team-settings', teamId] });
    queryClient.invalidateQueries({ queryKey: ['team-external-table', teamId] });
  };

  const updateApiSettingsMutation = useMutation({
    mutationFn: (payload: {
      fussballde_id?: string;
      fussballde_team_name?: string;
      default_response?: 'pending' | 'accepted' | 'tentative' | 'declined';
      default_rsvp_deadline_hours?: number | null;
      default_arrival_minutes?: number | null;
      default_arrival_minutes_training?: number | null;
      default_arrival_minutes_match?: number | null;
      default_arrival_minutes_other?: number | null;
    }) => teamsAPI.updateSettings(teamId, payload),
    onSuccess: () => {
      invalidateSettingsQueries();
      showToast('API-Einstellungen gespeichert', 'success');
    },
    onError: (mutationError: any) => {
      showToast(mutationError?.response?.data?.error || 'Fehler beim Speichern', 'error');
    },
  });

  const importNextGamesMutation = useMutation({
    mutationFn: async () => {
      const response = await teamsAPI.importNextGames(teamId, 8);
      return response.data;
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['events', teamId] });
      queryClient.invalidateQueries({ queryKey: ['all-events'] });
      const imported = Number(result?.imported || 0);
      const updated = Number(result?.updated || 0);
      const skipped = Number(result?.skipped || 0);
      showToast(`Nächste Spiele importiert: ${imported}, aktualisiert: ${updated}, übersprungen: ${skipped}`, 'success');
    },
    onError: (mutationError: any) => {
      showToast(mutationError?.response?.data?.error || 'Fehler beim Import der nächsten Spiele', 'error');
    },
  });

  const deleteImportedGamesMutation = useMutation({
    mutationFn: async () => {
      const response = await teamsAPI.deleteImportedGames(teamId);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events', teamId] });
      queryClient.invalidateQueries({ queryKey: ['all-events'] });
      setShowDeleteImportedGamesConfirm(false);
      showToast('Importierte Spiele gelöscht', 'success');
    },
    onError: (mutationError: any) => {
      showToast(mutationError?.response?.data?.error || 'Fehler beim Löschen', 'error');
    },
  });

  const updateDefaultSettingsMutation = useMutation({
    mutationFn: (payload: {
      default_response?: 'pending' | 'accepted' | 'tentative' | 'declined';
      default_rsvp_deadline_hours?: number | null;
      default_rsvp_deadline_hours_training?: number | null;
      default_rsvp_deadline_hours_match?: number | null;
      default_rsvp_deadline_hours_other?: number | null;
      default_arrival_minutes?: number | null;
      default_arrival_minutes_training?: number | null;
      default_arrival_minutes_match?: number | null;
      default_arrival_minutes_other?: number | null;
    }) => teamsAPI.updateSettings(teamId, payload),
    onSuccess: () => {
      invalidateSettingsQueries();
      showToast('Termineinstellungen gespeichert', 'success');
    },
    onError: (mutationError: any) => {
      showToast(mutationError?.response?.data?.error || 'Fehler beim Speichern', 'error');
    },
  });

  const updateHomeVenuesMutation = useMutation({
    mutationFn: (payload: {
      home_venues: Array<{ name: string; street?: string; zip_city?: string; pitch_type?: string }>;
      default_home_venue_name?: string | null;
    }) => teamsAPI.updateSettings(teamId, payload),
    onSuccess: () => {
      invalidateSettingsQueries();
      showToast('Heimspiel-Plätze gespeichert', 'success');
    },
    onError: (mutationError: any) => {
      showToast(mutationError?.response?.data?.error || 'Fehler beim Speichern', 'error');
    },
  });

  const uploadTeamPictureMutation = useMutation({
    mutationFn: (file: File) => teamsAPI.uploadTeamPicture(teamId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      showToast('Mannschaftsbild erfolgreich gespeichert', 'success');
    },
    onError: (mutationError: any) => {
      const status = mutationError?.response?.status;
      if (status === 413) {
        showToast('Bild ist zu groß. Bitte maximal 5MB verwenden.', 'warning');
        return;
      }
      showToast(mutationError?.response?.data?.error || 'Fehler beim Speichern des Mannschaftsbilds', 'error');
    },
  });

  const deleteTeamPictureMutation = useMutation({
    mutationFn: () => teamsAPI.deleteTeamPicture(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      showToast('Mannschaftsbild erfolgreich gelöscht', 'success');
    },
    onError: (mutationError: any) => {
      showToast(mutationError?.response?.data?.error || 'Fehler beim Löschen des Mannschaftsbilds', 'error');
    },
  });

  const updateTrainerTeamNameMutation = useMutation({
    mutationFn: (value: string | null) => settingsAPI.updateTrainerTeamName(teamId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainer-team-names'] });
      showToast('Teamname gespeichert', 'success');
    },
    onError: (mutationError: any) => {
      showToast(mutationError?.response?.data?.error || 'Teamname konnte nicht gespeichert werden', 'error');
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: () => teamsAPI.deleteTeam(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      showToast('Team wurde gelöscht', 'success');
      navigate('/teams', { replace: true });
    },
    onError: (mutationError: any) => {
      showToast(mutationError?.response?.data?.error || 'Team konnte nicht gelöscht werden', 'error');
    },
  });

  const normalizeFussballDeInput = (input: string): string => input.toUpperCase();

  const extractFussballDeIds = (input: string): string[] => {
    const matches = String(input || '').toUpperCase().match(/[A-Z0-9]{16,40}/g) || [];
    return [...new Set(matches)];
  };

  const extractFussballDeTeamNames = (input: string): string[] => {
    return [...new Set(
      String(input || '')
        .split(/[\n,;|]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )];
  };

  const saveApiSettings = () => {
    const extractedIds = extractFussballDeIds(fussballDeId);
    if (fussballDeId.trim() && extractedIds.length === 0) {
      showToast('Ungültiges fussball.de ID-Format', 'warning');
      return;
    }

    updateApiSettingsMutation.mutate({
      fussballde_id: extractedIds.length > 0 ? extractedIds.join(',') : undefined,
      fussballde_team_name: extractFussballDeTeamNames(fussballDeTeamName).join(',') || undefined,
    });
  };

  const saveAppointmentSettings = () => {
    const parseArrivalMinutes = (value: string, label: string): number | null | 'invalid' => {
      if (value.trim() === '') {
        return null;
      }
      const parsed = parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 240) {
        showToast(`${label} muss zwischen 0 und 240 Minuten liegen`, 'warning');
        return 'invalid';
      }
      return parsed;
    };

    const parsedArrivalMinutesTraining = parseArrivalMinutes(defaultArrivalMinutesTraining, 'Standard-Treffpunkt Training');
    if (parsedArrivalMinutesTraining === 'invalid') return;

    const parsedArrivalMinutesMatch = parseArrivalMinutes(defaultArrivalMinutesMatch, 'Standard-Treffpunkt Spiel');
    if (parsedArrivalMinutesMatch === 'invalid') return;

    const parseCategoryRsvpHours = (value: string, label: string): number | null | 'invalid' => {
      if (value.trim() === '') {
        return null;
      }
      const parsed = parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 168) {
        showToast(`${label} muss zwischen 0 und 168 Stunden liegen`, 'warning');
        return 'invalid';
      }
      return parsed;
    };

    const parsedRsvpDeadlineHoursTraining = parseCategoryRsvpHours(defaultRsvpDeadlineHoursTraining, 'Standard-Rückmeldefrist Training');
    if (parsedRsvpDeadlineHoursTraining === 'invalid') return;

    let parsedRsvpDeadlineHoursMatch: number | null = null;
    if (defaultRsvpDeadlineDaysMatch.trim() !== '') {
      const parsedDays = parseInt(defaultRsvpDeadlineDaysMatch, 10);
      if (!Number.isFinite(parsedDays) || parsedDays < 0 || parsedDays > 7) {
        showToast('Standard-Rückmeldefrist Spiel muss zwischen 0 und 7 Tagen liegen', 'warning');
        return;
      }
      parsedRsvpDeadlineHoursMatch = parsedDays * 24;
    }

    const parsedRsvpDeadlineHoursOther = parseCategoryRsvpHours(defaultRsvpDeadlineHoursOther, 'Standard-Rückmeldefrist Sonstiges');
    if (parsedRsvpDeadlineHoursOther === 'invalid') return;

    updateDefaultSettingsMutation.mutate({
      default_response: defaultResponse,
      default_rsvp_deadline_hours: parsedRsvpDeadlineHoursTraining,
      default_rsvp_deadline_hours_training: parsedRsvpDeadlineHoursTraining,
      default_rsvp_deadline_hours_match: parsedRsvpDeadlineHoursMatch,
      default_rsvp_deadline_hours_other: parsedRsvpDeadlineHoursOther,
      default_arrival_minutes: parsedArrivalMinutesTraining,
      default_arrival_minutes_training: parsedArrivalMinutesTraining,
      default_arrival_minutes_match: parsedArrivalMinutesMatch,
      default_arrival_minutes_other: parsedArrivalMinutesTraining,
    });
  };

  const saveHomeVenues = () => {
    const normalizedHomeVenues = homeVenues
      .map((venue) => ({
        name: venue.name.trim(),
        street: venue.street.trim(),
        zip_city: venue.zip_city.trim(),
        pitch_type: venue.pitch_type.trim(),
      }))
      .filter((venue) => venue.name || venue.street || venue.zip_city || venue.pitch_type);

    const invalidVenue = normalizedHomeVenues.find((venue) => !venue.name);
    if (invalidVenue) {
      showToast('Jeder Platz braucht mindestens einen Namen', 'warning');
      return;
    }

    const validVenueNames = normalizedHomeVenues.map((venue) => venue.name);
    const effectiveDefaultHomeVenueName =
      validVenueNames.length === 0
        ? null
        : validVenueNames.includes(defaultHomeVenueName)
          ? defaultHomeVenueName
          : validVenueNames[0];

    if (effectiveDefaultHomeVenueName !== defaultHomeVenueName) {
      setDefaultHomeVenueName(effectiveDefaultHomeVenueName || '');
    }

    updateHomeVenuesMutation.mutate({
      home_venues: normalizedHomeVenues,
      default_home_venue_name: effectiveDefaultHomeVenueName,
    });
  };

  const addHomeVenue = () => {
    setHomeVenues((prev) => {
      const next = [...prev, { name: '', street: '', zip_city: '', pitch_type: '' }];
      setExpandedHomeVenueIndex(next.length - 1);
      return next;
    });
  };

  const updateHomeVenue = (index: number, field: 'name' | 'street' | 'zip_city' | 'pitch_type', value: string) => {
    setHomeVenues((prev) => prev.map((venue, i) => (i === index ? { ...venue, [field]: value } : venue)));
  };

  const removeHomeVenue = (index: number) => {
    setHomeVenues((prev) => prev.filter((_, i) => i !== index));
    setExpandedHomeVenueIndex((prevExpanded) => {
      if (prevExpanded === null) return null;
      if (prevExpanded === index) return null;
      if (prevExpanded > index) return prevExpanded - 1;
      return prevExpanded;
    });
  };

  const toggleHomeVenueExpanded = (index: number) => {
    setExpandedHomeVenueIndex((prev) => (prev === index ? null : index));
  };

  const stepDefaultArrivalMinutes = (field: 'training' | 'match', delta: number) => {
    const currentValue = field === 'training' ? defaultArrivalMinutesTraining : defaultArrivalMinutesMatch;
    const current = parseInt(currentValue, 10);
    const baseValue = Number.isFinite(current) ? current : 0;
    const nextValue = Math.min(240, Math.max(0, baseValue + delta));
    if (field === 'training') {
      setDefaultArrivalMinutesTraining(String(nextValue));
      return;
    }
    setDefaultArrivalMinutesMatch(String(nextValue));
  };

  const stepCategoryRsvpDeadlineHours = (field: 'training' | 'other', delta: number) => {
    const currentValue =
      field === 'training'
        ? defaultRsvpDeadlineHoursTraining
        : defaultRsvpDeadlineHoursOther;
    const current = parseInt(currentValue, 10);
    const baseValue = Number.isFinite(current) ? current : 0;
    const nextValue = Math.min(168, Math.max(0, baseValue + delta));
    if (field === 'training') {
      setDefaultRsvpDeadlineHoursTraining(String(nextValue));
      return;
    }
    setDefaultRsvpDeadlineHoursOther(String(nextValue));
  };

  const stepMatchRsvpDeadlineDays = (delta: number) => {
    const current = parseInt(defaultRsvpDeadlineDaysMatch, 10);
    const baseValue = Number.isFinite(current) ? current : 0;
    const nextValue = Math.min(7, Math.max(0, baseValue + delta));
    setDefaultRsvpDeadlineDaysMatch(String(nextValue));
  };

  const handleDefaultNumberWheel = (event: React.WheelEvent<HTMLInputElement>, field: 'rsvp-training' | 'rsvp-match-days' | 'rsvp-other' | 'arrival-training' | 'arrival-match') => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 1 : -1;
    if (field === 'rsvp-training') {
      stepCategoryRsvpDeadlineHours('training', delta);
      return;
    }
    if (field === 'rsvp-match-days') {
      stepMatchRsvpDeadlineDays(delta);
      return;
    }
    if (field === 'rsvp-other') {
      stepCategoryRsvpDeadlineHours('other', delta);
      return;
    }
    if (field === 'arrival-training') {
      stepDefaultArrivalMinutes('training', delta * 5);
      return;
    }
    stepDefaultArrivalMinutes('match', delta * 5);
  };

  const handleTeamPictureSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      event.target.value = '';
      return;
    }

    if (!file.type.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
      showToast('Nur Bilddateien (JPEG, PNG, GIF, WEBP) sind erlaubt', 'warning');
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Die Datei ist zu groß. Maximale Größe: 5MB', 'warning');
      event.target.value = '';
      return;
    }

    uploadTeamPictureMutation.mutate(file);
    event.target.value = '';
  };

  const teamPictureUrl = resolveAssetUrl(team?.team_picture);
  const calendarFeedUrl = String((settings as any)?.calendar_feed_url || '');
  const calendarWebcalUrl = String((settings as any)?.calendar_webcal_url || '');

  const copyCalendarFeedUrl = async () => {
    if (!calendarFeedUrl) {
      showToast('Kein Kalender-Link verfügbar', 'warning');
      return;
    }

    try {
      await navigator.clipboard.writeText(calendarFeedUrl);
      showToast('Kalender-Link kopiert', 'success');
    } catch {
      showToast('Kalender-Link konnte nicht kopiert werden', 'error');
    }
  };

  if (user?.role !== 'trainer') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
        <button
          type="button"
          onClick={() => goBack(`/teams/${teamId}`)}
          className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          aria-label="Zurück"
          title="Zurück"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white break-words flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary-600 shrink-0" />
            <span>Team-Einstellungen</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-1">Standardwerte und fussball.de Verknüpfung verwalten</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-2">Lädt Einstellungen...</div>
      ) : error ? (
        <div className="text-sm text-red-600 dark:text-red-400 py-2">{(error as any)?.response?.data?.error || 'Einstellungen konnten nicht geladen werden'}</div>
      ) : (
        <>
          <div className="card space-y-4">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary-600" />
              Mannschaftsbild
            </h2>

            {teamPictureUrl ? (
              <img
                src={teamPictureUrl}
                alt={team?.name || 'Mannschaftsbild'}
                className="w-full max-h-72 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
              />
            ) : (
              <div className="w-full h-40 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                Noch kein Mannschaftsbild vorhanden
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                onChange={handleTeamPictureSelect}
                title="Mannschaftsbild auswählen"
                aria-label="Mannschaftsbild auswählen"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadTeamPictureMutation.isPending || deleteTeamPictureMutation.isPending}
                className="btn btn-primary w-full sm:w-auto disabled:opacity-50"
              >
                {uploadTeamPictureMutation.isPending ? 'Speichert...' : teamPictureUrl ? 'Mannschaftsbild ändern' : 'Mannschaftsbild hochladen'}
              </button>
              {teamPictureUrl && (
                <button
                  type="button"
                  onClick={() => deleteTeamPictureMutation.mutate()}
                  disabled={uploadTeamPictureMutation.isPending || deleteTeamPictureMutation.isPending}
                  className="btn btn-secondary w-full sm:w-auto disabled:opacity-50"
                >
                  {deleteTeamPictureMutation.isPending ? 'Löscht...' : 'Mannschaftsbild löschen'}
                </button>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">JPEG, PNG, GIF oder WEBP (max. 5MB)</p>
            </div>
          </div>

          <div className="card space-y-4">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-primary-600" />
              Dein individueller Teamname
            </h2>

            <p className="text-sm text-gray-600 dark:text-gray-300">
              Dieser Name hilft dir, das Team in deiner Ansicht leichter zu unterscheiden.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                type="text"
                value={customTeamName}
                onChange={(event) => setCustomTeamName(event.target.value)}
                className="input w-full"
                placeholder="z.B. Mein U19 Team"
                maxLength={80}
              />
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => updateTrainerTeamNameMutation.mutate(customTeamName.trim() || null)}
                  disabled={updateTrainerTeamNameMutation.isPending}
                  className="btn btn-primary flex-1 sm:flex-none disabled:opacity-50"
                >
                  {updateTrainerTeamNameMutation.isPending ? 'Speichert...' : 'Speichern'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomTeamName('');
                    updateTrainerTeamNameMutation.mutate(null);
                  }}
                  disabled={updateTrainerTeamNameMutation.isPending}
                  className="btn btn-secondary flex-1 sm:flex-none disabled:opacity-50"
                >
                  Zurücksetzen
                </button>
              </div>
            </div>
          </div>

          <div className="card space-y-4">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary-600" />
              API-Einstellungen
            </h2>
            <div>
              <label htmlFor="fussballde-id" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                fussball.de IDs
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <textarea
                  id="fussballde-id"
                  value={fussballDeId}
                  onChange={(e) => setFussballDeId(normalizeFussballDeInput(e.target.value))}
                  className="input w-full"
                  placeholder="Eine ID pro Zeile oder mehrere fussball.de URLs"
                  rows={3}
                />
                <button
                  type="button"
                  onClick={() => {
                    const extracted = extractFussballDeIds(fussballDeId);
                    if (extracted.length === 0) {
                      showToast('Keine gültige fussball.de ID in der Eingabe gefunden', 'warning');
                      return;
                    }
                    setFussballDeId(extracted.join('\n'));
                    showToast(`${extracted.length} fussball.de ID(s) übernommen`, 'info');
                  }}
                  className="btn btn-secondary w-full sm:w-auto whitespace-nowrap"
                >
                  Aus URL übernehmen
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Eine ID pro Zeile. Beispiel: 011MI8V6UC000000VTVG0001VTR8C1K7</p>
            </div>

            <div>
              <label htmlFor="fussballde-team-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                fussball.de Team-Namen
              </label>
              <textarea
                id="fussballde-team-name"
                value={fussballDeTeamName}
                onChange={(e) => setFussballDeTeamName(e.target.value)}
                className="input w-full"
                placeholder="Ein Teamname pro Zeile"
                rows={3}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ein Name pro Zeile. Wird für die automatische Heimspiel-Erkennung verwendet.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={saveApiSettings}
                disabled={updateApiSettingsMutation.isPending}
                className="btn btn-primary w-full disabled:opacity-50"
              >
                {updateApiSettingsMutation.isPending ? 'Speichert...' : 'API speichern'}
              </button>

              <button
                type="button"
                onClick={() => importNextGamesMutation.mutate()}
                disabled={importNextGamesMutation.isPending || extractFussballDeIds(fussballDeId).length === 0}
                className="btn btn-secondary w-full disabled:opacity-50"
              >
                {importNextGamesMutation.isPending ? 'Import läuft...' : 'Spiele importieren'}
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteImportedGamesConfirm(true)}
                disabled={deleteImportedGamesMutation.isPending}
                className="btn w-full bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:opacity-50"
              >
                {deleteImportedGamesMutation.isPending ? 'Löscht...' : 'Importierte Spiele löschen'}
              </button>
            </div>

            {showDeleteImportedGamesConfirm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Importierte Spiele wirklich löschen?</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                    Alle von fussball.de importierten Spiele werden gelöscht. Du kannst sie anschließend neu importieren.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDeleteImportedGamesConfirm(false)}
                      className="btn btn-secondary flex-1"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={() => deleteImportedGamesMutation.mutate()}
                      disabled={deleteImportedGamesMutation.isPending}
                      className="btn btn-danger flex-1 disabled:opacity-50"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="card space-y-4">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-primary-600" />
              Termineinstellungen
            </h2>
            <div>
              <label htmlFor="default-response" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Standard-Rückmeldung für neue Termine
              </label>
              <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label="Standard-Rückmeldung auswählen">
                {[
                  { value: 'pending', label: 'Offen' },
                  { value: 'accepted', label: 'Zugesagt' },
                  { value: 'tentative', label: 'Vielleicht' },
                  { value: 'declined', label: 'Abgesagt' },
                ].map((option) => {
                  const isActive = defaultResponse === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDefaultResponse(option.value as 'pending' | 'accepted' | 'tentative' | 'declined')}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Standard-Rückmeldefrist je Kategorie
              </label>

              <div>
                <label htmlFor="default-rsvp-deadline-hours-training" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Training</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => stepCategoryRsvpDeadlineHours('training', -1)}
                    className="btn btn-secondary px-3"
                    aria-label="Standard-Rückmeldefrist Training verringern"
                  >
                    −
                  </button>
                  <input
                    id="default-rsvp-deadline-hours-training"
                    type="number"
                    min={0}
                    max={168}
                    step={1}
                    value={defaultRsvpDeadlineHoursTraining}
                    onChange={(e) => setDefaultRsvpDeadlineHoursTraining(e.target.value)}
                    onWheel={(e) => handleDefaultNumberWheel(e, 'rsvp-training')}
                    className="input w-full text-center"
                    placeholder="z. B. 3"
                  />
                  <button
                    type="button"
                    onClick={() => stepCategoryRsvpDeadlineHours('training', 1)}
                    className="btn btn-secondary px-3"
                    aria-label="Standard-Rückmeldefrist Training erhöhen"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="default-rsvp-deadline-days-match" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Spiel (Tage vor Termin)</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => stepMatchRsvpDeadlineDays(-1)}
                    className="btn btn-secondary px-3"
                    aria-label="Standard-Rückmeldefrist Spiel verringern"
                  >
                    −
                  </button>
                  <input
                    id="default-rsvp-deadline-days-match"
                    type="number"
                    min={0}
                    max={7}
                    step={1}
                    value={defaultRsvpDeadlineDaysMatch}
                    onChange={(e) => setDefaultRsvpDeadlineDaysMatch(e.target.value)}
                    onWheel={(e) => handleDefaultNumberWheel(e, 'rsvp-match-days')}
                    className="input w-full text-center"
                    placeholder="z. B. 3"
                  />
                  <button
                    type="button"
                    onClick={() => stepMatchRsvpDeadlineDays(1)}
                    className="btn btn-secondary px-3"
                    aria-label="Standard-Rückmeldefrist Spiel erhöhen"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="default-rsvp-deadline-hours-other" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Sonstiges</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => stepCategoryRsvpDeadlineHours('other', -1)}
                    className="btn btn-secondary px-3"
                    aria-label="Standard-Rückmeldefrist Sonstiges verringern"
                  >
                    −
                  </button>
                  <input
                    id="default-rsvp-deadline-hours-other"
                    type="number"
                    min={0}
                    max={168}
                    step={1}
                    value={defaultRsvpDeadlineHoursOther}
                    onChange={(e) => setDefaultRsvpDeadlineHoursOther(e.target.value)}
                    onWheel={(e) => handleDefaultNumberWheel(e, 'rsvp-other')}
                    className="input w-full text-center"
                    placeholder="z. B. 24"
                  />
                  <button
                    type="button"
                    onClick={() => stepCategoryRsvpDeadlineHours('other', 1)}
                    className="btn btn-secondary px-3"
                    aria-label="Standard-Rückmeldefrist Sonstiges erhöhen"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Standard Treffpunkt Minuten vor Beginn
              </label>

              <div>
                <label htmlFor="default-arrival-minutes-training" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Training</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => stepDefaultArrivalMinutes('training', -5)}
                    className="btn btn-secondary px-3"
                    aria-label="Standard-Treffpunkt Minuten Training verringern"
                  >
                    −
                  </button>
                  <input
                    id="default-arrival-minutes-training"
                    type="number"
                    min={0}
                    max={240}
                    step={5}
                    value={defaultArrivalMinutesTraining}
                    onChange={(e) => setDefaultArrivalMinutesTraining(e.target.value)}
                    onWheel={(e) => handleDefaultNumberWheel(e, 'arrival-training')}
                    className="input w-full text-center"
                    placeholder="z. B. 30"
                  />
                  <button
                    type="button"
                    onClick={() => stepDefaultArrivalMinutes('training', 5)}
                    className="btn btn-secondary px-3"
                    aria-label="Standard-Treffpunkt Minuten Training erhöhen"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="default-arrival-minutes-match" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Spiel</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => stepDefaultArrivalMinutes('match', -5)}
                    className="btn btn-secondary px-3"
                    aria-label="Standard-Treffpunkt Minuten Spiel verringern"
                  >
                    −
                  </button>
                  <input
                    id="default-arrival-minutes-match"
                    type="number"
                    min={0}
                    max={240}
                    step={5}
                    value={defaultArrivalMinutesMatch}
                    onChange={(e) => setDefaultArrivalMinutesMatch(e.target.value)}
                    onWheel={(e) => handleDefaultNumberWheel(e, 'arrival-match')}
                    className="input w-full text-center"
                    placeholder="z. B. 45"
                  />
                  <button
                    type="button"
                    onClick={() => stepDefaultArrivalMinutes('match', 5)}
                    className="btn btn-secondary px-3"
                    aria-label="Standard-Treffpunkt Minuten Spiel erhöhen"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={saveAppointmentSettings}
              disabled={updateDefaultSettingsMutation.isPending}
              className="btn btn-primary w-full sm:w-auto disabled:opacity-50"
            >
              {updateDefaultSettingsMutation.isPending ? 'Speichert...' : 'Termineinstellungen speichern'}
            </button>
          </div>

          <div className="card space-y-4">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              Heimspiel-Plätze
            </h2>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Plätze für Heimspiele verwalten und einen Standardplatz festlegen.
                </p>
                <button
                  type="button"
                  onClick={addHomeVenue}
                  className="btn btn-secondary w-full sm:w-auto"
                >
                  Platz hinzufügen
                </button>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Standardplatz</label>
                <select
                  value={defaultHomeVenueName}
                  onChange={(e) => setDefaultHomeVenueName(e.target.value)}
                  className="input"
                  title="Standardplatz auswählen"
                  aria-label="Standardplatz auswählen"
                >
                  <option value="">Kein Standardplatz</option>
                  {homeVenues
                    .map((venue) => venue.name.trim())
                    .filter((name, index, arr) => name && arr.indexOf(name) === index)
                    .map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                </select>
              </div>

              {homeVenues.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400">
                  Noch keine Plätze angelegt.
                </div>
              ) : (
                <div className="space-y-3">
                  {homeVenues.map((venue, index) => (
                    <div key={index} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4 space-y-3 bg-gray-50/40 dark:bg-gray-800/40">
                      {(() => {
                        const isExpanded = expandedHomeVenueIndex === index;
                        const summaryParts = [venue.street.trim(), venue.zip_city.trim(), venue.pitch_type.trim()].filter(Boolean);

                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleHomeVenueExpanded(index)}
                              className="w-full flex items-start justify-between gap-3 text-left"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {venue.name.trim() || `Platz ${index + 1}`}
                                  </p>
                                  {venue.name.trim() && venue.name.trim() === defaultHomeVenueName.trim() && (
                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
                                      Standard
                                    </span>
                                  )}
                                </div>
                                {summaryParts.length > 0 && (
                                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 truncate">
                                    {summaryParts.join(' • ')}
                                  </p>
                                )}
                              </div>
                              <span className="text-gray-500 dark:text-gray-400 mt-0.5 shrink-0">
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </span>
                            </button>

                            {isExpanded && (
                              <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Platzname</label>
                                    <input
                                      type="text"
                                      value={venue.name}
                                      onChange={(e) => updateHomeVenue(index, 'name', e.target.value)}
                                      className="input"
                                      placeholder="z. B. Hauptplatz"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Platzart</label>
                                    <select
                                      value={venue.pitch_type}
                                      onChange={(e) => updateHomeVenue(index, 'pitch_type', e.target.value)}
                                      className="input"
                                      title="Platzart"
                                      aria-label="Platzart"
                                    >
                                      <option value="">Bitte wählen</option>
                                      {pitchTypeOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Straße</label>
                                    <input
                                      type="text"
                                      value={venue.street}
                                      onChange={(e) => updateHomeVenue(index, 'street', e.target.value)}
                                      className="input"
                                      placeholder="z. B. Musterstraße 12"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">PLZ / Ort</label>
                                    <input
                                      type="text"
                                      value={venue.zip_city}
                                      onChange={(e) => updateHomeVenue(index, 'zip_city', e.target.value)}
                                      className="input"
                                      placeholder="z. B. 12345 Musterstadt"
                                    />
                                  </div>
                                </div>

                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => removeHomeVenue(index)}
                                    className="btn btn-secondary w-full sm:w-auto"
                                  >
                                    Entfernen
                                  </button>
                                </div>
                              </>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={saveHomeVenues}
              disabled={updateHomeVenuesMutation.isPending}
              className="btn btn-primary w-full sm:w-auto disabled:opacity-50"
            >
              {updateHomeVenuesMutation.isPending ? 'Speichert...' : 'Heimspiel-Plätze speichern'}
            </button>
          </div>

          <div className="card space-y-4">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              Kalender-Export
            </h2>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Diesen Link in Apple/Google/Outlook als Abo-Kalender hinzufügen. Neue oder geänderte Termine werden automatisch beim nächsten Kalender-Refresh übernommen.
            </p>

            <div className="space-y-2">
              <label className="block text-xs text-gray-500 dark:text-gray-400">ICS-Feed URL</label>
              <input
                type="text"
                readOnly
                value={calendarFeedUrl}
                className="input"
                placeholder="Kalender-Link wird geladen..."
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={copyCalendarFeedUrl}
                className="btn btn-secondary w-full sm:w-auto"
                disabled={!calendarFeedUrl}
              >
                Link kopieren
              </button>
              {calendarWebcalUrl && (
                <a
                  href={calendarWebcalUrl}
                  className="btn btn-primary w-full sm:w-auto text-center"
                >
                  In Kalender abonnieren
                </a>
              )}
            </div>
          </div>

          <div className="card border-2 border-red-200 dark:border-red-900 space-y-4">
            <h2 className="text-lg sm:text-xl font-semibold text-red-700 dark:text-red-400">
              Gefahrenzone
            </h2>
            <p className="text-sm text-red-700 dark:text-red-300">
              Das Löschen entfernt das Team und alle zugehörigen Termine endgültig.
            </p>
            <button
              type="button"
              onClick={() => setShowDeleteTeamConfirm(true)}
              disabled={deleteTeamMutation.isPending}
              className="btn btn-danger w-full sm:w-auto disabled:opacity-50"
            >
              {deleteTeamMutation.isPending ? 'Löscht...' : 'Team löschen'}
            </button>
          </div>

          {showDeleteTeamConfirm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Team wirklich löschen?</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteTeamConfirm(false)}
                    className="btn btn-secondary flex-1"
                    disabled={deleteTeamMutation.isPending}
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={() => deleteTeamMutation.mutate()}
                    disabled={deleteTeamMutation.isPending}
                    className="btn btn-danger flex-1 disabled:opacity-50"
                  >
                    Löschen
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
