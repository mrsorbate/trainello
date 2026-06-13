import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, CalendarDays, MapPin, Repeat, Settings2, Loader2, Check } from 'lucide-react';
import { eventsAPI, teamsAPI } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { resolveAssetUrl, stepNumberFieldValue } from '../lib/utils';
import { useToast } from '../lib/useToast';
import AccessibleModal from '../components/AccessibleModal';

interface EventResponse {
  user_id?: number | string | null;
}

export default function EventEditPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id ? parseInt(id, 10) : NaN;
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const locationStateFrom = typeof (location.state as any)?.from === 'string'
    ? (location.state as any).from
    : '';
  const originFrom = locationStateFrom && locationStateFrom !== location.pathname
    ? locationStateFrom
    : '';

  const isTrainer = user?.role === 'trainer';

  const [eventData, setEventData] = useState({
    title: '',
    type: 'training' as 'training' | 'match' | 'other',
    description: '',
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
  });
  const [inviteSelectionModalOpen, setInviteSelectionModalOpen] = useState(false);
  const [saveWholeSeries, setSaveWholeSeries] = useState(false);
  const [seriesRepeatUntil, setSeriesRepeatUntil] = useState('');
  const [seriesRepeatDays, setSeriesRepeatDays] = useState<number[]>([]);
  const [seriesValidationMessage, setSeriesValidationMessage] = useState('');

  const durationConfig = { min: 5, step: 5 } as const;
  const arrivalConfig = { min: 0, max: 240, step: 5 } as const;
  const rsvpHoursConfig = { min: 0, max: 168, step: 1 } as const;

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

  const handleMinutesWheel = (
    event: React.WheelEvent<HTMLInputElement>,
    field: 'duration_minutes' | 'arrival_minutes'
  ) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 5 : -5;
    if (field === 'duration_minutes') {
      stepDurationMinutes(delta);
      return;
    }
    stepArrivalMinutes(delta);
  };

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

  const toLocalInputValue = (value?: string | null): string => {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const formatLocalDateTime = (date: Date): string => {
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
    setEventData((prev) => ({ ...prev, rsvp_deadline: formatLocalDateTime(deadlineDate) }));
  };

  const getCurrentRsvpDeadlineOffsetHours = (): string => {
    if (!eventData.start_time || !eventData.rsvp_deadline) {
      return '';
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

  const { data: event, isLoading } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const response = await eventsAPI.getById(eventId);
      return response.data;
    },
    enabled: Number.isFinite(eventId),
  });

  const { data: teamSettings } = useQuery({
    queryKey: ['team-settings', event?.team_id],
    queryFn: async () => {
      const response = await teamsAPI.getSettings(event!.team_id);
      return response.data;
    },
    enabled: Boolean(event?.team_id),
  });

  const { data: membersForEdit } = useQuery({
    queryKey: ['team-members', event?.team_id],
    queryFn: async () => {
      const response = await teamsAPI.getMembers(event!.team_id);
      return response.data;
    },
    enabled: Boolean(event?.team_id),
  });

  const allMemberIds = membersForEdit?.map((member: any) => member.id) || [];

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
    if (!event) {
      return;
    }

    const parsedDuration = event.duration_minutes && Number.isFinite(Number(event.duration_minutes))
      ? String(event.duration_minutes)
      : (() => {
          const start = new Date(event.start_time);
          const end = new Date(event.end_time);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return '';
          }
          return String(Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)));
        })();

    const invitedUserIds: number[] = [];
    if (Array.isArray(event.responses)) {
      for (const response of event.responses as EventResponse[]) {
        const userId = Number(response?.user_id);
        if (Number.isFinite(userId) && !invitedUserIds.includes(userId)) {
          invitedUserIds.push(userId);
        }
      }
    }

    setEventData({
      title: event.title || '',
      type: (event.type || 'training') as 'training' | 'match' | 'other',
      description: event.description || '',
      location_venue: event.location_venue || event.location || '',
      location_street: event.location_street || '',
      location_zip_city: event.location_zip_city || '',
      pitch_type: event.pitch_type || '',
      meeting_point: event.meeting_point || '',
      arrival_minutes: event.arrival_minutes === null || event.arrival_minutes === undefined ? '' : String(event.arrival_minutes),
      start_time: toLocalInputValue(event.start_time),
      duration_minutes: parsedDuration,
      end_time: toLocalInputValue(event.end_time),
      rsvp_deadline: toLocalInputValue(event.rsvp_deadline),
      visibility_all: event.visibility_all === 1 || event.visibility_all === true,
      invite_all: event.invite_all === 1 || event.invite_all === true,
      invited_user_ids: invitedUserIds,
    });

    const parsedRepeatDays = (() => {
      const rawValue = (event as any)?.repeat_days;
      if (Array.isArray(rawValue)) {
        return [...new Set(rawValue.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))];
      }
      if (typeof rawValue === 'string' && rawValue.trim()) {
        try {
          const parsed = JSON.parse(rawValue);
          if (Array.isArray(parsed)) {
            return [...new Set(parsed.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))];
          }
        } catch {
          return [];
        }
      }
      return [];
    })();

    const fallbackDay = (() => {
      const startDate = new Date(event.start_time);
      return Number.isNaN(startDate.getTime()) ? 1 : startDate.getDay();
    })();

    const repeatUntilFromEvent = (() => {
      const rawValue = String((event as any)?.repeat_until || '').trim();
      if (!rawValue) {
        return '';
      }
      return rawValue.length >= 10 ? rawValue.slice(0, 10) : rawValue;
    })();

    setSeriesRepeatDays(parsedRepeatDays.length > 0 ? parsedRepeatDays : [fallbackDay]);
    setSeriesRepeatUntil(repeatUntilFromEvent);
    setSaveWholeSeries(false);
    setSeriesValidationMessage('');
  }, [event]);

  useEffect(() => {
    if (!eventData.invite_all || !allMemberIds.length) {
      return;
    }

    const hasAllMembersSelected = eventData.invited_user_ids.length === allMemberIds.length;
    if (!hasAllMembersSelected) {
      setEventData((prev) => ({ ...prev, invited_user_ids: allMemberIds }));
    }
  }, [eventData.invite_all, eventData.invited_user_ids.length, allMemberIds.length]);

  useEffect(() => {
    if (!eventData.start_time || !eventData.duration_minutes) {
      return;
    }

    const startDate = new Date(eventData.start_time);
    const minutes = parseInt(eventData.duration_minutes, 10);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(minutes)) {
      return;
    }

    const endDate = new Date(startDate.getTime() + minutes * 60000);
    const pad = (num: number) => String(num).padStart(2, '0');
    const formatted = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
    if (eventData.end_time !== formatted) {
      setEventData((prev) => ({ ...prev, end_time: formatted }));
    }
  }, [eventData.start_time, eventData.duration_minutes, eventData.end_time]);

  useEffect(() => {
    if (!defaultHomeVenue) {
      return;
    }

    const shouldUseDefaultVenue = eventData.type === 'training' || (eventData.type === 'match' && event?.is_home_match !== 0);
    if (!shouldUseDefaultVenue) {
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
  }, [defaultHomeVenue, eventData.type, event?.is_home_match, eventData.location_venue, eventData.location_street, eventData.location_zip_city]);

  useEffect(() => {
    if (!eventData.start_time || eventData.rsvp_deadline) {
      return;
    }

    const defaultHours = getCategoryDefaultRsvpHours(teamSettings, eventData.type);
    if (defaultHours === null) {
      return;
    }

    applyRsvpDeadlineOffsetHours(defaultHours);
  }, [
    eventData.start_time,
    eventData.rsvp_deadline,
    eventData.type,
    teamSettings?.default_rsvp_deadline_hours,
    teamSettings?.default_rsvp_deadline_hours_training,
    teamSettings?.default_rsvp_deadline_hours_match,
    teamSettings?.default_rsvp_deadline_hours_other,
  ]);

  const updateEventMutation = useMutation({
    mutationFn: ({ data, updateSeries }: { data: any; updateSeries: boolean }) =>
      eventsAPI.update(eventId, data, updateSeries),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      if (variables.updateSeries && event?.team_id) {
        navigate(`/teams/${event.team_id}/events`, { replace: true });
        return;
      }
      navigate(`/events/${eventId}`, {
        replace: true,
        state: originFrom ? { from: originFrom } : undefined,
      });
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.error || 'Termin konnte nicht gespeichert werden', 'error');
    },
  });

  const submitUpdate = (updateSeries: boolean) => {
    if (updateSeries) {
      if (!seriesRepeatUntil) {
        setSeriesValidationMessage('Bitte wähle, bis wann die Serie gespeichert werden soll.');
        return;
      }
      if (seriesRepeatDays.length === 0) {
        setSeriesValidationMessage('Bitte wähle mindestens einen Wochentag für die Serie.');
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

    const dataToSend = {
      title: eventData.title,
      type: eventData.type,
      description: eventData.description || undefined,
      location: eventData.location_venue || undefined,
      location_venue: eventData.location_venue || undefined,
      location_street: eventData.location_street || undefined,
      location_zip_city: eventData.location_zip_city || undefined,
      pitch_type: eventData.pitch_type || undefined,
      meeting_point: eventData.meeting_point || undefined,
      arrival_minutes: eventData.arrival_minutes === '' ? undefined : parseInt(eventData.arrival_minutes, 10),
      start_time: new Date(eventData.start_time).toISOString(),
      end_time: new Date(eventData.end_time).toISOString(),
      rsvp_deadline: eventData.rsvp_deadline ? new Date(eventData.rsvp_deadline).toISOString() : undefined,
      duration_minutes: eventData.duration_minutes === '' ? undefined : parseInt(eventData.duration_minutes, 10),
      visibility_all: eventData.visibility_all,
      invite_all: eventData.invite_all,
      invited_user_ids: eventData.invited_user_ids,
      repeat_until: updateSeries ? seriesRepeatUntil : undefined,
      repeat_days: updateSeries ? [...new Set(seriesRepeatDays)].sort((a, b) => a - b) : undefined,
    };

    updateEventMutation.mutate({ data: dataToSend, updateSeries });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitUpdate(Boolean(event?.series_id) && saveWholeSeries);
  };

  const openInviteSelectionModal = () => {
    if (!membersForEdit?.length) {
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

  if (isLoading) {
    return <div className="loading-card">Termin wird geladen...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const target = originFrom || `/events/${eventId}`;
            navigate(target, { replace: true });
          }}
          className="text-gray-300 hover:text-white"
          aria-label="Zurück"
          title="Zurück"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl sm:text-3xl font-bold text-white">Termin bearbeiten</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
          <div className="card space-y-4">
            <h4 className="font-medium text-white flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary-400" />
              Termin
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p id="event-edit-category-label" className="block text-sm font-medium text-gray-300">Kategorie *</p>
              <div className="mt-1 grid grid-cols-3 gap-2" role="group" aria-labelledby="event-edit-category-label">
                {categoryOptions.map((option) => {
                  const isActive = eventData.type === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setEventData({ ...eventData, type: option.value })}
                      className={`segment-option ${
                        isActive
                          ? 'segment-option-active'
                          : 'segment-option-inactive'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p id="event-edit-pitch-type-label" className="block text-sm font-medium text-gray-300">Platzart</p>
              <div className="mt-1 flex flex-wrap gap-2" role="group" aria-labelledby="event-edit-pitch-type-label">
                {pitchTypeOptions.map((option) => {
                  const isActive = eventData.pitch_type === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setEventData({ ...eventData, pitch_type: option.value })}
                      className={`segment-option ${
                        isActive
                          ? 'segment-option-active'
                          : 'segment-option-inactive'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="event-edit-title" className="block text-sm font-medium text-gray-300">Titel *</label>
              <input
                id="event-edit-title"
                type="text"
                required
                value={eventData.title}
                onChange={(e) => setEventData({ ...eventData, title: e.target.value })}
                title="Titel"
                className="input mt-1"
              />
            </div>

            <div className="min-w-0">
              <label htmlFor="event-edit-start-time" className="block text-sm font-medium text-gray-300">Beginn *</label>
              <input
                id="event-edit-start-time"
                type="datetime-local"
                required
                value={eventData.start_time}
                onChange={(e) => setEventData({ ...eventData, start_time: e.target.value })}
                title="Beginn"
                className="input mt-1 w-full min-w-0"
              />
              <p className="text-xs text-gray-400 mt-1">
                {eventData.start_time ? `Gewählt: ${eventData.start_time.replace('T', ' ')}` : 'Datum und Uhrzeit auswählen'}
              </p>
            </div>

            <div>
              <label htmlFor="event-edit-duration" className="block text-sm font-medium text-gray-300">Dauer (Minuten) *</label>
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
                  id="event-edit-duration"
                  type="number"
                  min={durationConfig.min}
                  step={durationConfig.step}
                  required
                  value={eventData.duration_minutes}
                  onChange={(e) => setEventData({ ...eventData, duration_minutes: e.target.value })}
                  onWheel={(e) => handleMinutesWheel(e, 'duration_minutes')}
                  inputMode="numeric"
                  title="Dauer in Minuten"
                  className="input text-center flex-1 min-w-0"
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
            </div>
            </div>
          </div>

          <div className="card space-y-4">
            <h4 className="font-medium text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-400" />
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
              <label htmlFor="event-edit-location-venue" className="block text-sm font-medium text-gray-300">Ort oder Spielstätte</label>
              <input
                id="event-edit-location-venue"
                type="text"
                value={eventData.location_venue}
                onChange={(e) => setEventData({ ...eventData, location_venue: e.target.value })}
                title="Ort oder Spielstätte"
                className="input mt-1"
              />
            </div>

            <div>
              <label htmlFor="event-edit-location-street" className="block text-sm font-medium text-gray-300">Strasse</label>
              <input
                id="event-edit-location-street"
                type="text"
                value={eventData.location_street}
                onChange={(e) => setEventData({ ...eventData, location_street: e.target.value })}
                title="Strasse"
                className="input mt-1"
              />
            </div>

            <div>
              <label htmlFor="event-edit-location-zip-city" className="block text-sm font-medium text-gray-300">PLZ Ort</label>
              <input
                id="event-edit-location-zip-city"
                type="text"
                value={eventData.location_zip_city}
                onChange={(e) => setEventData({ ...eventData, location_zip_city: e.target.value })}
                title="PLZ Ort"
                className="input mt-1"
              />
            </div>

            <div>
              <label htmlFor="event-edit-meeting-point" className="block text-sm font-medium text-gray-300">Treffpunkt</label>
              <input
                id="event-edit-meeting-point"
                type="text"
                value={eventData.meeting_point}
                onChange={(e) => setEventData({ ...eventData, meeting_point: e.target.value })}
                title="Treffpunkt"
                className="input mt-1"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="event-edit-arrival-minutes" className="block text-sm font-medium text-gray-300">Treffen vor Beginn (Minuten)</label>
                <button
                  type="button"
                  onClick={() => {
                    const categoryDefaultArrival = getCategoryDefaultArrivalMinutes(teamSettings, eventData.type);
                    setEventData((prev) => ({
                      ...prev,
                      arrival_minutes: categoryDefaultArrival === null ? '' : String(categoryDefaultArrival),
                    }));
                  }}
                  className="text-action"
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
                  id="event-edit-arrival-minutes"
                  type="number"
                  min={arrivalConfig.min}
                  max={arrivalConfig.max}
                  step={arrivalConfig.step}
                  value={eventData.arrival_minutes}
                  onChange={(e) => setEventData({ ...eventData, arrival_minutes: e.target.value })}
                  onWheel={(e) => handleMinutesWheel(e, 'arrival_minutes')}
                  inputMode="numeric"
                  title="Treffen vor Beginn in Minuten"
                  className="input text-center flex-1 min-w-0"
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
            </div>

            <div className="md:col-span-2">
              <label htmlFor="event-edit-description" className="block text-sm font-medium text-gray-300">Beschreibung</label>
              <textarea
                id="event-edit-description"
                value={eventData.description}
                onChange={(e) => setEventData({ ...eventData, description: e.target.value })}
                title="Beschreibung"
                className="input mt-1 min-h-[90px]"
              />
            </div>
            </div>
          </div>

          <div className="card space-y-4">
              <div className="space-y-4">
                <h4 className="font-medium text-white flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary-400" />
                  Einstellungen
                </h4>

                <label htmlFor="event-edit-visibility-all" className="flex items-center space-x-3">
                  <input
                    id="event-edit-visibility-all"
                    type="checkbox"
                    checked={eventData.visibility_all}
                    onChange={(e) => setEventData({ ...eventData, visibility_all: e.target.checked })}
                    className="h-4 w-4 text-primary-400"
                  />
                  <span className="text-sm text-gray-300">Teilnehmerliste für alle sichtbar</span>
                </label>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="event-edit-rsvp-hours" className="block text-sm font-medium text-gray-300">Rückmeldefrist (Stunden vor Termin)</label>
                    <button
                      type="button"
                      onClick={() => {
                        const defaultHours = getCategoryDefaultRsvpHours(teamSettings, eventData.type);
                        if (defaultHours !== null) {
                          applyRsvpDeadlineOffsetHours(defaultHours);
                        }
                      }}
                      className="text-action"
                    >
                      Team-Default
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (!eventData.start_time) return;
                        const current = parseInt(getCurrentRsvpDeadlineOffsetHours(), 10);
                        const baseValue = Number.isFinite(current) ? current : rsvpHoursConfig.min;
                        const nextValue = stepNumberFieldValue(baseValue, -1, rsvpHoursConfig);
                        applyRsvpDeadlineOffsetHours(nextValue);
                      }}
                      disabled={!eventData.start_time}
                      className="btn btn-secondary w-12 px-0 shrink-0"
                      aria-label="Rückmeldefrist Stunden verringern"
                    >
                      −
                    </button>
                    <input
                      id="event-edit-rsvp-hours"
                      type="number"
                      min={rsvpHoursConfig.min}
                      max={rsvpHoursConfig.max}
                      step={rsvpHoursConfig.step}
                      value={getCurrentRsvpDeadlineOffsetHours()}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        if (!Number.isFinite(value)) {
                          setEventData((prev) => ({ ...prev, rsvp_deadline: '' }));
                          return;
                        }
                        applyRsvpDeadlineOffsetHours(value);
                      }}
                      title="Stunden vor Termin"
                      aria-label="Rückmeldefrist in Stunden vor Termin"
                      inputMode="numeric"
                      disabled={!eventData.start_time}
                      className="input text-center flex-1 min-w-0"
                      placeholder="z.B. 24"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!eventData.start_time) return;
                        const current = parseInt(getCurrentRsvpDeadlineOffsetHours(), 10);
                        const baseValue = Number.isFinite(current) ? current : rsvpHoursConfig.min;
                        const nextValue = stepNumberFieldValue(baseValue, 1, rsvpHoursConfig);
                        applyRsvpDeadlineOffsetHours(nextValue);
                      }}
                      disabled={!eventData.start_time}
                      className="btn btn-secondary w-12 px-0 shrink-0"
                      aria-label="Rückmeldefrist Stunden erhöhen"
                    >
                      +
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Frist endet am: {eventData.rsvp_deadline ? eventData.rsvp_deadline.replace('T', ' ') : '—'}
                  </p>
                </div>

                {membersForEdit?.length ? (
                  <div>
                    <p className="block text-sm font-medium text-gray-300 mb-2">Teammitglieder</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={openInviteSelectionModal}
                        className="btn btn-secondary"
                      >
                        Teammitglieder auswählen
                      </button>
                      <span className="text-xs text-gray-400">
                        {eventData.invite_all
                          ? `Alle ${allMemberIds.length} Teammitglieder eingeladen`
                          : `${eventData.invited_user_ids.length} von ${allMemberIds.length} Teammitgliedern eingeladen`}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
          </div>

          {event?.series_id ? (
            <div className="card space-y-4">
              <h4 className="font-medium text-white flex items-center gap-2">
                <Repeat className="w-4 h-4 text-primary-400" />
                Serientermin
              </h4>
              <div className="space-y-4">
                <div>
                  <p id="event-edit-save-series-label" className="block text-sm font-medium text-gray-300 mb-2">Ganze Serie speichern</p>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="event-edit-save-series-label">
                    <button
                      type="button"
                      onClick={() => {
                        setSaveWholeSeries(true);
                        setSeriesValidationMessage('');
                      }}
                      className={`segment-option ${
                        saveWholeSeries
                          ? 'segment-option-active'
                          : 'segment-option-inactive'
                      }`}
                    >
                      Ja
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSaveWholeSeries(false);
                        setSeriesValidationMessage('');
                      }}
                      className={`segment-option ${
                        !saveWholeSeries
                          ? 'segment-option-active'
                          : 'segment-option-inactive'
                      }`}
                    >
                      Nein
                    </button>
                  </div>
                  {!saveWholeSeries && (
                    <p className="text-xs text-amber-400 mt-2">
                      Dieser Termin wird aus der Serie abgelöst und eigenständig gespeichert.
                    </p>
                  )}
                </div>

                {saveWholeSeries ? (
                  <>
                    <div>
                      <p id="event-edit-repeat-days-label" className="block text-sm font-medium text-gray-300 mb-2">Wochentage auswählen</p>
                      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="event-edit-repeat-days-label">
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
                              setSeriesValidationMessage('');
                              setSeriesRepeatDays((prev) => (
                                prev.includes(day.value)
                                  ? prev.filter((value) => value !== day.value)
                                  : [...prev, day.value]
                              ));
                            }}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                              seriesRepeatDays.includes(day.value)
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-700 text-gray-200 border border-gray-600 hover:bg-gray-600'
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="event-edit-repeat-until" className="block text-sm font-medium text-gray-300">Wiederholung endet am *</label>
                      <input
                        id="event-edit-repeat-until"
                        type="date"
                        required={saveWholeSeries}
                        value={seriesRepeatUntil}
                        onChange={(e) => {
                          setSeriesValidationMessage('');
                          setSeriesRepeatUntil(e.target.value);
                        }}
                        title="Wiederholungsende auswählen"
                        aria-label="Wiederholungsende auswählen"
                        className="input mt-1"
                      />
                    </div>

                    {seriesValidationMessage ? (
                      <p className="text-sm text-red-400">{seriesValidationMessage}</p>
                    ) : null}
                  </>
                ) : null}

                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Ganze Serie speichern ja oder nein">
                  <div className="col-span-2 text-xs text-gray-400">
                    Bei „Ja“ werden die Änderungen auf die komplette Serie mit den gewählten Wochentagen bis zum Enddatum angewendet.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-2 pt-4 border-t border-gray-700 flex flex-col gap-3">
            <button type="submit" className="btn btn-primary w-full" disabled={updateEventMutation.isPending}>
              {updateEventMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin inline mr-1" />Speichern...</> : 'Speichern'}
            </button>
            <button
              type="button"
              onClick={() => {
                const target = originFrom || `/events/${eventId}`;
                navigate(target, { replace: true });
              }}
              className="btn btn-secondary w-full inline-flex items-center justify-center text-center"
            >
              Abbrechen
            </button>
          </div>
      </form>

      {inviteSelectionModalOpen && membersForEdit?.length ? (
        <AccessibleModal
          labelledBy="edit-invite-selection-title"
          onClose={() => setInviteSelectionModalOpen(false)}
          className="items-end sm:items-center p-0 sm:p-4"
          panelClassName="card max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-2xl"
        >
            <h3 id="edit-invite-selection-title" className="text-lg font-semibold text-white">Teilnehmer auswählen</h3>
            <p className="text-sm text-gray-300 mt-1 mb-3">
              Wähle aus, welche Spieler eingeladen werden.
            </p>

            <div className="mb-3">
              <button
                type="button"
                onClick={() => setEventData((prev) => ({ ...prev, invited_user_ids: allMemberIds, invite_all: true }))}
                className="text-action"
              >
                Alle auswählen
              </button>
            </div>

            <div className="overflow-y-auto overscroll-contain pr-1 space-y-2">
              {membersForEdit.map((member: any) => {
                const isChecked = eventData.invited_user_ids.includes(member.id);
                const avatarUrl = resolveAssetUrl(member?.profile_picture);
                return (
                  <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-700 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={`${member.name} Profilbild`}
                          className="w-8 h-8 rounded-full object-cover border border-gray-700"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-700 text-gray-200 text-xs font-semibold flex items-center justify-center">
                          {getInitials(member.name)}
                        </div>
                      )}
                      <span className="text-sm text-gray-300 truncate">{member.name}</span>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isChecked}
                      aria-label={`${member.name} ${isChecked ? 'nicht einladen' : 'einladen'}`}
                      onClick={() => {
                        const nextIds = isChecked
                          ? eventData.invited_user_ids.filter((value) => value !== member.id)
                          : [...eventData.invited_user_ids, member.id];
                        const inviteAll = nextIds.length === allMemberIds.length;
                        setEventData((prev) => ({ ...prev, invited_user_ids: nextIds, invite_all: inviteAll }));
                      }}
                      className={`inline-flex min-h-11 min-w-[4.75rem] items-center justify-between gap-2 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800 ${
                        isChecked
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-700 text-gray-200'
                      }`}
                    >
                      <span>{isChecked ? 'Ein' : 'Aus'}</span>
                      <span
                        className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${
                          isChecked ? 'bg-gray-900/80 text-primary-200' : 'bg-gray-500'
                        }`}
                      >
                        {isChecked ? <Check className="w-3 h-3" aria-hidden="true" /> : null}
                      </span>
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
        </AccessibleModal>
      ) : null}
    </div>
  );
}
