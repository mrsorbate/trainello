import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { eventsAPI, teamsAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { ArrowLeft, CalendarDays, MapPin, Settings2, Repeat } from 'lucide-react';
import { resolveAssetUrl, stepNumberFieldValue } from '../lib/utils';
import { useToast } from '../lib/useToast';
import { useSmartBack } from '../hooks/useSmartBack';

export default function EventCreatePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const teamIdFromParam = id ? parseInt(id) : null;
  const teamIdFromQuery = searchParams.get('teamId') ? parseInt(searchParams.get('teamId') as string, 10) : null;
  const initialTeamId = teamIdFromParam ?? teamIdFromQuery;

  const { user } = useAuthStore();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const goBack = useSmartBack();
  const queryClient = useQueryClient();

  const isTrainer = user?.role === 'trainer';

  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>(initialTeamId ? [initialTeamId] : []);
  const [eventData, setEventData] = useState({
    title: '',
    type: 'training' as 'training' | 'match' | 'other',
    description: '',
    location: '',
    location_venue: '',
    location_street: '',
    location_zip_city: '',
    pitch_type: '',
    meeting_point: '',
    arrival_minutes: '',
    start_time: '',
    duration_minutes: '',
    end_time: '',
    rsvp_deadline: '',
    visibility_all: true,
    invite_all: true,
    invited_user_ids: [] as number[],
    repeat_type: 'none' as 'none' | 'weekly' | 'custom',
    repeat_until: '',
    repeat_days: [] as number[],
  });
  const [inviteSelectionModalOpen, setInviteSelectionModalOpen] = useState(false);
  const [rsvpDeadlineOffsetHours, setRsvpDeadlineOffsetHours] = useState('');
  const [seriesValidationMessage, setSeriesValidationMessage] = useState('');

  const durationConfig = { min: 5, step: 5 } as const;
  const arrivalConfig = { min: 0, max: 240, step: 5 } as const;
  const rsvpHoursConfig = { min: 0, max: 168, step: 1 } as const;

  const categoryOptions: Array<{ value: 'training' | 'match' | 'other'; label: string }> = [
    { value: 'training', label: 'Training' },
    { value: 'match', label: 'Spiel' },
    { value: 'other', label: 'Sonstiges' },
  ];

  const pitchTypeOptions: Array<{ value: string; label: string }> = [
    { value: 'Rasen', label: 'Rasen' },
    { value: 'Kunstrasen', label: 'Kunstrasen' },
    { value: 'Halle', label: 'Halle' },
    { value: 'Sonstiges', label: 'Sonstiges' },
  ];

  const getInitials = (name: string): string => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  };

  const stepDurationMinutes = (delta: number) => {
    setEventData((prev) => {
      const nextValue = stepNumberFieldValue(prev.duration_minutes, delta, durationConfig);
      return { ...prev, duration_minutes: String(nextValue) };
    });
  };

  const stepArrivalMinutes = (delta: number) => {
    setEventData((prev) => {
      const nextValue = stepNumberFieldValue(prev.arrival_minutes, delta, arrivalConfig);
      return { ...prev, arrival_minutes: String(nextValue) };
    });
  };

  const formatLocalDateTime = (date: Date) => {
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const applyRsvpDeadlineOffsetHours = (hoursBefore: number) => {
    if (!eventData.start_time) {
      return;
    }

    const startDate = new Date(eventData.start_time);
    if (Number.isNaN(startDate.getTime())) {
      return;
    }

    const normalizedHours = stepNumberFieldValue(hoursBefore, 0, rsvpHoursConfig);
    const deadlineDate = new Date(startDate.getTime() - normalizedHours * 60 * 60 * 1000);
    setRsvpDeadlineOffsetHours(String(normalizedHours));
    setEventData((prev) => ({ ...prev, rsvp_deadline: formatLocalDateTime(deadlineDate) }));
  };

  const getCurrentRsvpDeadlineOffsetHours = (): string => {
    if (rsvpDeadlineOffsetHours !== '') {
      return rsvpDeadlineOffsetHours;
    }

    if (!eventData.start_time || !eventData.rsvp_deadline) {
      const defaultHours = getCategoryDefaultRsvpHours(teamSettings, eventData.type);
      return defaultHours === null ? '' : String(defaultHours);
    }

    const startDate = new Date(eventData.start_time);
    const deadlineDate = new Date(eventData.rsvp_deadline);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(deadlineDate.getTime())) {
      return '';
    }

    const diffMs = startDate.getTime() - deadlineDate.getTime();
    if (diffMs < 0) {
      return '0';
    }

    const diffHours = Math.round(diffMs / (60 * 60 * 1000));
    return String(stepNumberFieldValue(diffHours, 0, rsvpHoursConfig));
  };

  const handleMinutesWheel = (event: React.WheelEvent<HTMLInputElement>, field: 'duration_minutes' | 'arrival_minutes') => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 5 : -5;
    if (field === 'duration_minutes') {
      stepDurationMinutes(delta);
      return;
    }
    stepArrivalMinutes(delta);
  };

  const getCategoryDefaultRsvpHours = (
    settings: any,
    type: 'training' | 'match' | 'other'
  ): number | null => {
    const parseHours = (value: unknown): number | null => {
      if (value === null || value === undefined || String(value).trim() === '') {
        return null;
      }
      const parsed = parseInt(String(value), 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 168) {
        return null;
      }
      return parsed;
    };

    const typeValue =
      type === 'training'
        ? settings?.default_rsvp_deadline_hours_training
        : type === 'match'
          ? settings?.default_rsvp_deadline_hours_match
          : settings?.default_rsvp_deadline_hours_other;

    const fromType = parseHours(typeValue);
    if (fromType !== null) {
      return fromType;
    }

    return parseHours(settings?.default_rsvp_deadline_hours);
  };

  const getCategoryDefaultArrivalMinutes = (
    settings: any,
    type: 'training' | 'match' | 'other'
  ): number | null => {
    const parseMinutes = (value: unknown): number | null => {
      if (value === null || value === undefined || String(value).trim() === '') {
        return null;
      }
      const parsed = parseInt(String(value), 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 240) {
        return null;
      }
      return parsed;
    };

    const typeValue =
      type === 'training'
        ? settings?.default_arrival_minutes_training
        : type === 'match'
          ? settings?.default_arrival_minutes_match
          : settings?.default_arrival_minutes_other;

    const fromType = parseMinutes(typeValue);
    if (fromType !== null) {
      return fromType;
    }

    return parseMinutes(settings?.default_arrival_minutes);
  };

  const getCategoryDefaultDurationMinutes = (
    settings: any,
    type: 'training' | 'match' | 'other'
  ): number | null => {
    const parseMinutes = (value: unknown): number | null => {
      if (value === null || value === undefined || String(value).trim() === '') {
        return null;
      }
      const parsed = parseInt(String(value), 10);
      if (!Number.isFinite(parsed) || parsed < 5 || parsed > 480) {
        return null;
      }
      return parsed;
    };

    const typeValue =
      type === 'training'
        ? settings?.default_duration_minutes_training
        : type === 'match'
          ? settings?.default_duration_minutes_match
          : settings?.default_duration_minutes_other;

    const fromType = parseMinutes(typeValue);
    if (fromType !== null) {
      return fromType;
    }

    return parseMinutes(settings?.default_duration_minutes);
  };

  const { data: teamsForCreate } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await teamsAPI.getAll();
      return response.data;
    },
    enabled: isTrainer,
  });

  useEffect(() => {
    if (initialTeamId) {
      setSelectedTeamIds([initialTeamId]);
      return;
    }
    if (teamsForCreate?.length && selectedTeamIds.length === 0) {
      setSelectedTeamIds([teamsForCreate[0].id]);
    }
  }, [initialTeamId, teamsForCreate, selectedTeamIds.length]);

  const effectiveTeamId = selectedTeamIds[0] ?? null;

  const toggleTeamSelection = (teamId: number) => {
    setSelectedTeamIds((prev) => {
      if (prev.includes(teamId)) {
        const next = prev.filter((id) => id !== teamId);
        return next.length > 0 ? next : prev;
      }
      return [...prev, teamId];
    });
  };

  const { data: membersForCreate } = useQuery({
    queryKey: ['team-members', selectedTeamIds],
    queryFn: async () => {
      const responses = await Promise.all(selectedTeamIds.map((teamId) => teamsAPI.getMembers(teamId)));
      const byId = new Map<number, any>();

      for (const response of responses) {
        for (const member of response.data || []) {
          if (!byId.has(member.id)) {
            byId.set(member.id, member);
          }
        }
      }

      return Array.from(byId.values());
    },
    enabled: isTrainer && selectedTeamIds.length > 0,
  });

  const allMemberIds = membersForCreate?.map((member: any) => member.id) || [];

  const { data: teamSettings } = useQuery({
    queryKey: ['team-settings', effectiveTeamId],
    queryFn: async () => {
      const response = await teamsAPI.getSettings(effectiveTeamId!);
      return response.data;
    },
    enabled: isTrainer && !!effectiveTeamId,
    retry: false,
  });

  const homeVenues = Array.isArray(teamSettings?.home_venues)
    ? teamSettings.home_venues.filter((venue: any) => venue && typeof venue === 'object' && String(venue.name || '').trim())
    : [];

  const defaultHomeVenue = (() => {
    if (!homeVenues.length) return null;
    const defaultHomeVenueName = String(teamSettings?.default_home_venue_name || '').trim();
    if (!defaultHomeVenueName) {
      return homeVenues[0];
    }
    return homeVenues.find((venue: any) => String(venue?.name || '').trim() === defaultHomeVenueName) || homeVenues[0];
  })();

  const applyHomeVenueByIndex = (indexValue: string) => {
    const index = parseInt(indexValue, 10);
    if (!Number.isFinite(index) || index < 0 || index >= homeVenues.length) {
      return;
    }
    const selectedVenue = homeVenues[index];
    setEventData((prev) => ({
      ...prev,
      location_venue: String(selectedVenue?.name || ''),
      location_street: String(selectedVenue?.street || ''),
      location_zip_city: String(selectedVenue?.zip_city || ''),
      pitch_type: String(selectedVenue?.pitch_type || ''),
    }));
  };

  useEffect(() => {
    if (!eventData.start_time || !eventData.duration_minutes) {
      return;
    }

    const startDate = new Date(eventData.start_time);
    if (isNaN(startDate.getTime())) {
      return;
    }

    const minutes = parseInt(eventData.duration_minutes, 10);
    if (Number.isNaN(minutes)) {
      return;
    }

    const endDate = new Date(startDate.getTime() + minutes * 60000);
    const pad = (value: number) => value.toString().padStart(2, '0');
    const formatted = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;

    if (eventData.end_time !== formatted) {
      setEventData((prev) => ({ ...prev, end_time: formatted }));
    }
  }, [eventData.start_time, eventData.duration_minutes, eventData.end_time]);

  useEffect(() => {
    if (!eventData.start_time || eventData.rsvp_deadline) {
      return;
    }

    const alreadySetOffset = parseInt(rsvpDeadlineOffsetHours, 10);
    if (Number.isFinite(alreadySetOffset)) {
      applyRsvpDeadlineOffsetHours(alreadySetOffset);
      return;
    }

    const deadlineHours = getCategoryDefaultRsvpHours(teamSettings, eventData.type);

    if (deadlineHours === null || !Number.isFinite(deadlineHours) || deadlineHours < 0) {
      return;
    }

    const startDate = new Date(eventData.start_time);
    if (isNaN(startDate.getTime())) {
      return;
    }

    applyRsvpDeadlineOffsetHours(deadlineHours);
  }, [
    eventData.start_time,
    eventData.rsvp_deadline,
    rsvpDeadlineOffsetHours,
    eventData.type,
    teamSettings?.default_rsvp_deadline_hours,
    teamSettings?.default_rsvp_deadline_hours_training,
    teamSettings?.default_rsvp_deadline_hours_match,
    teamSettings?.default_rsvp_deadline_hours_other,
  ]);

  useEffect(() => {
    if (!membersForCreate?.length) {
      return;
    }

    if (eventData.invited_user_ids.length === 0) {
      const allIds = membersForCreate.map((member: any) => member.id);
      setEventData((prev) => ({ ...prev, invited_user_ids: allIds }));
    }
  }, [membersForCreate, eventData.invited_user_ids.length]);

  useEffect(() => {
    if (selectedTeamIds.length === 0) {
      return;
    }
    setEventData((prev) => ({ ...prev, invited_user_ids: [], invite_all: true }));
  }, [selectedTeamIds]);

  useEffect(() => {
    if (!teamSettings) {
      return;
    }

    setEventData((prev) => {
      const next = { ...prev };
      const categoryDefaultArrival = getCategoryDefaultArrivalMinutes(teamSettings, next.type);
      if (!next.arrival_minutes && categoryDefaultArrival !== null) {
        next.arrival_minutes = String(categoryDefaultArrival);
      }
      return next;
    });
  }, [
    teamSettings?.default_arrival_minutes,
    teamSettings?.default_arrival_minutes_training,
    teamSettings?.default_arrival_minutes_match,
    teamSettings?.default_arrival_minutes_other,
    eventData.type,
  ]);

  useEffect(() => {
    if (!teamSettings) {
      return;
    }

    setEventData((prev) => {
      if (String(prev.duration_minutes || '').trim() !== '') {
        return prev;
      }

      const categoryDefaultDuration = getCategoryDefaultDurationMinutes(teamSettings, prev.type);
      if (categoryDefaultDuration === null) {
        return prev;
      }

      return {
        ...prev,
        duration_minutes: String(categoryDefaultDuration),
      };
    });
  }, [
    teamSettings?.default_duration_minutes,
    teamSettings?.default_duration_minutes_training,
    teamSettings?.default_duration_minutes_match,
    teamSettings?.default_duration_minutes_other,
    eventData.type,
  ]);

  useEffect(() => {
    if (!defaultHomeVenue) {
      return;
    }
    if (eventData.type !== 'training' && eventData.type !== 'match') {
      return;
    }

    const hasManualLocation = Boolean(
      String(eventData.location_venue || '').trim()
      || String(eventData.location_street || '').trim()
      || String(eventData.location_zip_city || '').trim()
    );

    if (hasManualLocation) {
      return;
    }

    setEventData((prev) => ({
      ...prev,
      location_venue: String(defaultHomeVenue?.name || ''),
      location_street: String(defaultHomeVenue?.street || ''),
      location_zip_city: String(defaultHomeVenue?.zip_city || ''),
      pitch_type: prev.pitch_type || String(defaultHomeVenue?.pitch_type || ''),
    }));
  }, [defaultHomeVenue, eventData.type, eventData.location_venue, eventData.location_street, eventData.location_zip_city]);

  const createEventMutation = useMutation({
    mutationFn: (data: any) => eventsAPI.create(data),
    onSuccess: () => {
      if (effectiveTeamId !== null) {
        queryClient.invalidateQueries({ queryKey: ['events', effectiveTeamId] });
      }
      queryClient.invalidateQueries({ queryKey: ['all-events'] });
      navigate(effectiveTeamId ? `/teams/${effectiveTeamId}/events?created=1` : '/events?created=1');
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.error || 'Termin konnte nicht gespeichert werden', 'error');
    },
  });

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();

    if (!effectiveTeamId) {
      return;
    }

    if (!eventData.end_time) {
      return;
    }

    if (eventData.invited_user_ids.length === 0) {
      showToast('Bitte waehle mindestens ein Teammitglied aus.', 'warning');
      return;
    }

    const isSeriesEnabled = eventData.repeat_type !== 'none';
    if (isSeriesEnabled) {
      if (!eventData.repeat_until) {
        setSeriesValidationMessage('Bitte wähle, bis wann die Serie erstellt werden soll.');
        showToast('Bitte Wiederholungsende für den Serientermin auswählen.', 'warning');
        return;
      }
      if (eventData.repeat_days.length === 0) {
        setSeriesValidationMessage('Bitte wähle mindestens einen Wochentag für die Serie.');
        showToast('Bitte mindestens einen Wochentag für die Serie auswählen.', 'warning');
        return;
      }
    }

    setSeriesValidationMessage('');

    const selectedPitchType = String(eventData.pitch_type || '').trim().toLowerCase();
    if (selectedPitchType) {
      const hasMatchingVenue = homeVenues.some(
        (venue: any) => String(venue?.pitch_type || '').trim().toLowerCase() === selectedPitchType
      );
      if (!hasMatchingVenue) {
        showToast(`Für die Platzart "${eventData.pitch_type}" ist kein Heimspiel-Platz hinterlegt`, 'warning');
        return;
      }
    }

    const resolvedLocation = eventData.location_venue || eventData.location_zip_city || eventData.location;
    const dataToSend: any = {
      team_id: effectiveTeamId,
      team_ids: selectedTeamIds,
      title: eventData.title,
      type: eventData.type,
      description: eventData.description,
      location: resolvedLocation,
      location_venue: eventData.location_venue,
      location_street: eventData.location_street,
      location_zip_city: eventData.location_zip_city,
      pitch_type: eventData.pitch_type || undefined,
      meeting_point: eventData.meeting_point || undefined,
      arrival_minutes: eventData.arrival_minutes ? parseInt(eventData.arrival_minutes, 10) : undefined,
      start_time: eventData.start_time,
      end_time: eventData.end_time,
      duration_minutes: eventData.duration_minutes ? parseInt(eventData.duration_minutes, 10) : undefined,
      visibility_all: eventData.visibility_all,
      invite_all: eventData.invite_all,
      invited_user_ids: eventData.invited_user_ids,
    };

    if (eventData.rsvp_deadline) {
      dataToSend.rsvp_deadline = eventData.rsvp_deadline;
    }

    if (isSeriesEnabled) {
      dataToSend.repeat_type = 'custom';
      dataToSend.repeat_until = eventData.repeat_until;
      dataToSend.repeat_days = eventData.repeat_days;
    }

    createEventMutation.mutate(dataToSend);
  };

  const openInviteSelectionModal = () => {
    if (!membersForCreate?.length) {
      return;
    }

    if (eventData.invited_user_ids.length === 0) {
      setEventData((prev) => ({ ...prev, invited_user_ids: allMemberIds, invite_all: true }));
    }

    setInviteSelectionModalOpen(true);
  };

  const closeInviteSelectionModal = () => {
    const inviteAll = allMemberIds.length > 0 && eventData.invited_user_ids.length === allMemberIds.length;
    setEventData((prev) => ({ ...prev, invite_all: inviteAll }));
    setInviteSelectionModalOpen(false);
  };

  if (!isTrainer) {
    return <Navigate to="/events" replace />;
  }

  const categoryDefaultDurationMinutes = getCategoryDefaultDurationMinutes(teamSettings, eventData.type);
  const categoryDefaultArrivalMinutes = getCategoryDefaultArrivalMinutes(teamSettings, eventData.type);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
          <button
            type="button"
            onClick={() => goBack(effectiveTeamId ? `/teams/${effectiveTeamId}/events` : '/events')}
            className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            aria-label="Zurück"
            title="Zurück"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white break-words">Neuen Termin erstellen</h1>
        </div>
      </div>

      <form onSubmit={handleCreateEvent} className="space-y-5">
          <div className="card space-y-4">
            <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary-600" />
              Termin
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!initialTeamId && teamsForCreate?.length === 1 && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Teams</label>
                <div className="mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200">
                  {teamsForCreate[0].name}
                </div>
              </div>
            )}
            {!initialTeamId && (!teamsForCreate || teamsForCreate.length > 1) && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Teams *</label>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {teamsForCreate?.length ? (
                    teamsForCreate.map((team: any) => {
                      const checked = selectedTeamIds.includes(team.id);
                      return (
                        <label
                          key={team.id}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                            checked
                              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTeamSelection(team.id)}
                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-200">{team.name}</span>
                        </label>
                      );
                    })
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400">Keine Teams verfügbar</div>
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Wenn du mehrere Teams auswählst, wird ein gemeinsamer Termin für alle markierten Teams erstellt.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Kategorie *</label>
              <div className="mt-1 grid grid-cols-3 gap-2" role="group" aria-label="Kategorie auswählen">
                {categoryOptions.map((option) => {
                  const isActive = eventData.type === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setEventData({ ...eventData, type: option.value, rsvp_deadline: '' })}
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

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Titel *</label>
              <input
                type="text"
                required
                value={eventData.title}
                onChange={(e) => setEventData({ ...eventData, title: e.target.value })}
                className="input mt-1"
                placeholder="z.B. Training, Heimspiel gegen..."
              />
            </div>

            <div className="min-w-0">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Beginn *</label>
              <input
                type="datetime-local"
                required
                value={eventData.start_time}
                onChange={(e) => setEventData({ ...eventData, start_time: e.target.value })}
                title="Beginn auswählen"
                aria-label="Beginn auswählen"
                className="input mt-1 w-full min-w-0"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {eventData.start_time ? `Gewählt: ${eventData.start_time.replace('T', ' ')}` : 'Datum und Uhrzeit auswählen'}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Dauer (Minuten) *</label>
                <button
                  type="button"
                  onClick={() => {
                    if (categoryDefaultDurationMinutes !== null) {
                      setEventData((prev) => ({ ...prev, duration_minutes: String(categoryDefaultDurationMinutes) }));
                    }
                  }}
                  className="text-xs text-primary-600 hover:text-primary-500"
                >
                  Team-Default
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => stepDurationMinutes(-5)}
                  className="btn btn-secondary w-12 px-0 shrink-0"
                  aria-label="Dauer verringern"
                >
                  −
                </button>
                <input
                  type="number"
                  min={durationConfig.min}
                  step={durationConfig.step}
                  required
                  value={eventData.duration_minutes}
                  onChange={(e) => setEventData({ ...eventData, duration_minutes: e.target.value })}
                  onWheel={(e) => handleMinutesWheel(e, 'duration_minutes')}
                  className="input text-center flex-1 min-w-0"
                  placeholder="z.B. 90"
                />
                <button
                  type="button"
                  onClick={() => stepDurationMinutes(5)}
                  className="btn btn-secondary w-12 px-0 shrink-0"
                  aria-label="Dauer erhöhen"
                >
                  +
                </button>
              </div>
              {String(eventData.duration_minutes || '').trim() === '' && categoryDefaultDurationMinutes !== null && (
                <p className="text-xs text-primary-600 dark:text-primary-300 mt-1">
                  Team-Default: {categoryDefaultDurationMinutes} Minuten
                </p>
              )}
              {eventData.end_time && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ende: {eventData.end_time.replace('T', ' ')}</p>
              )}
            </div>
            </div>
          </div>

          <div className="card space-y-4">
            <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-600" />
              Ort & Organisation
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(eventData.type === 'match' || eventData.type === 'training') && homeVenues.length > 0 && (
              <div className="md:col-span-2">
                <select
                  defaultValue=""
                  onChange={(e) => applyHomeVenueByIndex(e.target.value)}
                  className="input"
                  title="Ort oder Spielstätte auswählen"
                  aria-label="Ort oder Spielstätte auswählen"
                >
                  <option value="">Ort oder Spielstätte auswählen</option>
                  {homeVenues.map((venue: any, index: number) => (
                    <option key={`${venue.name}-${index}`} value={index}>
                      {venue.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ort oder Spielstätte</label>
              <input
                type="text"
                value={eventData.location_venue}
                onChange={(e) => setEventData({ ...eventData, location_venue: e.target.value })}
                className="input mt-1"
                placeholder="z.B. Sportzentrum Sued"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Straße</label>
              <input
                type="text"
                value={eventData.location_street}
                onChange={(e) => setEventData({ ...eventData, location_street: e.target.value })}
                className="input mt-1"
                placeholder="z.B. Musterstrasse 12"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">PLZ Ort</label>
              <input
                type="text"
                value={eventData.location_zip_city}
                onChange={(e) => setEventData({ ...eventData, location_zip_city: e.target.value })}
                className="input mt-1"
                placeholder="z.B. 12345 Musterstadt"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Platzart</label>
              <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Platzart auswählen">
                {pitchTypeOptions.map((option) => {
                  const isActive = eventData.pitch_type === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setEventData({ ...eventData, pitch_type: option.value })}
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

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Treffpunkt</label>
              <input
                type="text"
                value={eventData.meeting_point}
                onChange={(e) => setEventData({ ...eventData, meeting_point: e.target.value })}
                className="input mt-1"
                placeholder="z.B. Parkplatz Haupttor"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">X Minuten vor dem Termin</label>
                <button
                  type="button"
                  onClick={() => {
                    const categoryDefaultArrival = getCategoryDefaultArrivalMinutes(teamSettings, eventData.type);
                    setEventData((prev) => ({
                      ...prev,
                      arrival_minutes: categoryDefaultArrival === null ? '' : String(categoryDefaultArrival),
                    }));
                  }}
                  className="text-xs text-primary-600 hover:text-primary-500"
                >
                  Minuten auf Team-Default
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => stepArrivalMinutes(-5)}
                  className="btn btn-secondary w-12 px-0 shrink-0"
                  aria-label="Ankunftsminuten verringern"
                >
                  −
                </button>
                <input
                  type="number"
                  min={arrivalConfig.min}
                  max={arrivalConfig.max}
                  step={arrivalConfig.step}
                  value={eventData.arrival_minutes}
                  onChange={(e) => setEventData({ ...eventData, arrival_minutes: e.target.value })}
                  onWheel={(e) => handleMinutesWheel(e, 'arrival_minutes')}
                  className="input text-center flex-1 min-w-0"
                  placeholder="z.B. 15"
                />
                <button
                  type="button"
                  onClick={() => stepArrivalMinutes(5)}
                  className="btn btn-secondary w-12 px-0 shrink-0"
                  aria-label="Ankunftsminuten erhöhen"
                >
                  +
                </button>
              </div>
              {String(eventData.arrival_minutes || '').trim() === '' && categoryDefaultArrivalMinutes !== null && (
                <p className="text-xs text-primary-600 dark:text-primary-300 mt-1">
                  Team-Default: {categoryDefaultArrivalMinutes} Minuten
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Optionale Beschreibung</label>
              <textarea
                value={eventData.description}
                onChange={(e) => setEventData({ ...eventData, description: e.target.value })}
                className="input mt-1"
                rows={3}
                placeholder="Optionale Details..."
              />
            </div>
            </div>
          </div>

            <div className="card space-y-4">
              <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary-600" />
                Einstellungen
              </h4>

              <div className="space-y-4">
                {membersForCreate?.length ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Teammitglieder</label>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={openInviteSelectionModal}
                        className="btn btn-secondary"
                      >
                        Teammitglieder auswählen
                      </button>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {eventData.invite_all
                          ? `Alle ${allMemberIds.length} Teammitglieder eingeladen`
                          : `${eventData.invited_user_ids.length} von ${allMemberIds.length} Teammitgliedern eingeladen`}
                      </span>
                    </div>
                  </div>
                ) : null}

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={eventData.visibility_all}
                    onChange={(e) => setEventData({ ...eventData, visibility_all: e.target.checked })}
                    className="h-4 w-4 text-primary-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Teilnehmerliste für alle sichtbar</span>
                </label>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rückmeldefrist (Stunden vor Termin)</label>
                    <button
                      type="button"
                      onClick={() => {
                        const defaultHours = getCategoryDefaultRsvpHours(teamSettings, eventData.type);
                        if (defaultHours !== null) {
                          setRsvpDeadlineOffsetHours(String(defaultHours));
                          if (eventData.start_time) {
                            applyRsvpDeadlineOffsetHours(defaultHours);
                          }
                        }
                      }}
                      className="text-xs text-primary-600 hover:text-primary-500"
                    >
                      Team-Default
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(getCurrentRsvpDeadlineOffsetHours(), 10);
                        const baseValue = Number.isFinite(current) ? current : rsvpHoursConfig.min;
                        const nextValue = stepNumberFieldValue(baseValue, -1, rsvpHoursConfig);
                        setRsvpDeadlineOffsetHours(String(nextValue));
                        if (eventData.start_time) {
                          applyRsvpDeadlineOffsetHours(nextValue);
                        }
                      }}
                      className="btn btn-secondary w-12 px-0 shrink-0"
                      aria-label="Rückmeldefrist Stunden verringern"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={rsvpHoursConfig.min}
                      max={rsvpHoursConfig.max}
                      step={rsvpHoursConfig.step}
                      value={getCurrentRsvpDeadlineOffsetHours()}
                      onChange={(e) => {
                        setRsvpDeadlineOffsetHours(e.target.value);
                        const value = parseInt(e.target.value, 10);
                        if (!Number.isFinite(value)) {
                          setEventData((prev) => ({ ...prev, rsvp_deadline: '' }));
                          return;
                        }
                        if (!eventData.start_time) {
                          return;
                        }
                        applyRsvpDeadlineOffsetHours(value);
                      }}
                      title="Stunden vor Termin"
                      aria-label="Rückmeldefrist in Stunden vor Termin"
                      className="input text-center flex-1 min-w-0"
                      placeholder="z.B. 24"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(getCurrentRsvpDeadlineOffsetHours(), 10);
                        const baseValue = Number.isFinite(current) ? current : rsvpHoursConfig.min;
                        const nextValue = stepNumberFieldValue(baseValue, 1, rsvpHoursConfig);
                        setRsvpDeadlineOffsetHours(String(nextValue));
                        if (eventData.start_time) {
                          applyRsvpDeadlineOffsetHours(nextValue);
                        }
                      }}
                      className="btn btn-secondary w-12 px-0 shrink-0"
                      aria-label="Rückmeldefrist Stunden erhöhen"
                    >
                      +
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Frist endet am: {eventData.rsvp_deadline ? eventData.rsvp_deadline.replace('T', ' ') : (eventData.start_time ? '—' : 'wird nach Wahl von Beginn berechnet')}
                  </p>
                </div>
              </div>
          </div>

            <div className="card space-y-4">
              <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <Repeat className="w-4 h-4 text-primary-600" />
                Serientermin
              </h4>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Serientermin</label>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label="Serientermin ja oder nein">
                    <button
                      type="button"
                      onClick={() => {
                        const startDate = new Date(eventData.start_time);
                        const fallbackDay = Number.isNaN(startDate.getTime()) ? 1 : startDate.getDay();
                        setSeriesValidationMessage('');
                        setEventData((prev) => ({
                          ...prev,
                          repeat_type: 'custom',
                          repeat_days: prev.repeat_days.length > 0 ? prev.repeat_days : [fallbackDay],
                        }));
                      }}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        eventData.repeat_type !== 'none'
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      Ja
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSeriesValidationMessage('');
                        setEventData((prev) => ({
                          ...prev,
                          repeat_type: 'none',
                          repeat_days: [],
                          repeat_until: '',
                        }));
                      }}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        eventData.repeat_type === 'none'
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      Nein
                    </button>
                  </div>
                </div>

                {eventData.repeat_type !== 'none' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Wochentage auswählen</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: 1, label: 'Mo' },
                          { value: 2, label: 'Di' },
                          { value: 3, label: 'Mi' },
                          { value: 4, label: 'Do' },
                          { value: 5, label: 'Fr' },
                          { value: 6, label: 'Sa' },
                          { value: 0, label: 'So' },
                        ].map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => {
                              const newDays = eventData.repeat_days.includes(day.value)
                                ? eventData.repeat_days.filter((d) => d !== day.value)
                                : [...eventData.repeat_days, day.value];
                              setSeriesValidationMessage('');
                              setEventData({ ...eventData, repeat_days: newDays });
                            }}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                              eventData.repeat_days.includes(day.value)
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Wähle die Wochentage aus, an denen der Termin stattfindet.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Wiederholung endet am *</label>
                      <input
                        type="date"
                        value={eventData.repeat_until}
                        onChange={(e) => {
                          setSeriesValidationMessage('');
                          setEventData({ ...eventData, repeat_until: e.target.value });
                        }}
                        title="Wiederholungsende auswählen"
                        aria-label="Wiederholungsende auswählen"
                        className="input mt-1"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Bis zu welchem Datum sollen die Termine erstellt werden?</p>
                    </div>

                    {seriesValidationMessage ? (
                      <p className="text-sm text-red-600 dark:text-red-400">{seriesValidationMessage}</p>
                    ) : null}
                  </>
                )}
              </div>
          </div>

          <div className="mt-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              className="btn btn-primary w-full sm:w-auto"
              disabled={
                createEventMutation.isPending ||
                !effectiveTeamId
              }
            >
              {createEventMutation.isPending ? 'Erstellt...' : 'Termin erstellen'}
            </button>
            <button
              type="button"
              onClick={() => navigate(effectiveTeamId ? `/teams/${effectiveTeamId}/events` : '/events')}
              className="btn btn-secondary w-full sm:w-auto"
            >
              Abbrechen
            </button>
          </div>
      </form>

      {inviteSelectionModalOpen && membersForCreate?.length ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Teilnehmer auswählen</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 mb-3">
              Wähle aus, welche Spieler eingeladen werden.
            </p>

            <div className="mb-3">
              <button
                type="button"
                onClick={() => setEventData((prev) => ({ ...prev, invited_user_ids: allMemberIds, invite_all: true }))}
                className="text-xs text-primary-600 hover:text-primary-500"
              >
                Alle auswählen
              </button>
            </div>

            <div className="overflow-y-auto pr-1 space-y-2">
              {membersForCreate.map((member: any) => {
                const isChecked = eventData.invited_user_ids.includes(member.id);
                const avatarUrl = resolveAssetUrl(member?.profile_picture);
                return (
                  <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={`${member.name} Profilbild`}
                          className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold flex items-center justify-center">
                          {getInitials(member.name)}
                        </div>
                      )}
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{member.name}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const nextIds = isChecked
                          ? eventData.invited_user_ids.filter((value) => value !== member.id)
                          : [...eventData.invited_user_ids, member.id];
                        const inviteAll = nextIds.length === allMemberIds.length;
                        setEventData((prev) => ({ ...prev, invited_user_ids: nextIds, invite_all: inviteAll }));
                      }}
                      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        isChecked
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <span>{isChecked ? 'ON' : 'OFF'}</span>
                      <span
                        className={`w-3 h-3 rounded-full ${
                          isChecked ? 'bg-white' : 'bg-gray-500 dark:bg-gray-300'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setInviteSelectionModalOpen(false)}
                className="btn btn-secondary flex-1"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={closeInviteSelectionModal}
                className="btn btn-primary flex-1"
                disabled={eventData.invited_user_ids.length === 0}
              >
                Übernehmen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
