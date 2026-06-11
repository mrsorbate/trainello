import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import axios from 'axios';
import { resolveAssetUrl } from '../lib/utils';

const API_URL = import.meta.env.VITE_API_URL || '';

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

export default function FirstTimeSetupPage() {
  const [organizationName, setOrganizationName] = useState('');
  const [organizationShortName, setOrganizationShortName] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [timezone, setTimezone] = useState('Europe/Berlin');
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const adminPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const setAuth = useAuthStore((state) => state.setAuth);

  const getCurrentPasswords = () => {
    const currentAdminPassword = adminPasswordRef.current?.value ?? adminPassword;
    const currentConfirmPassword = confirmPasswordRef.current?.value ?? confirmPassword;
    return { currentAdminPassword, currentConfirmPassword };
  };

  const setupMutation = useMutation({
    mutationFn: async () => {
      const { currentAdminPassword, currentConfirmPassword } = getCurrentPasswords();

      if (!organizationName.trim()) {
        throw new Error('Vereinsname ist erforderlich');
      }
      if (!adminEmail.trim()) {
        throw new Error('Admin E-Mail ist erforderlich');
      }
      if (!adminUsername.trim()) {
        throw new Error('Admin Benutzername ist erforderlich');
      }
      if (currentAdminPassword.length < 6) {
        throw new Error('Passwort muss mindestens 6 Zeichen lang sein');
      }
      if (currentAdminPassword !== currentConfirmPassword) {
        throw new Error('Passwörter stimmen nicht überein');
      }

      const response = await axios.post(`${API_URL}/api/admin/first-setup`, {
        organizationName,
        organizationShortName: organizationShortName.trim() ? organizationShortName.trim() : null,
        adminUsername: adminUsername.trim().toLowerCase(),
        adminEmail,
        adminPassword: currentAdminPassword,
        timezone,
      });

      if (logoFile) {
        const formData = new FormData();
        formData.append('logo', logoFile);
        await axios.post(`${API_URL}/api/admin/upload/logo`, formData, {
          headers: {
            Authorization: `Bearer ${response.data.token}`,
            'Content-Type': 'multipart/form-data',
          },
        });
      }

      return response.data;
    },
    onSuccess: (data) => {
      // Auto-login
      setAuth(data.token, data.user);
      // Reload to get organization data
      setTimeout(() => {
        window.location.href = '/';
      }, 100);
    },
    onError: (error: any) => {
      let message = 'Setup fehlgeschlagen';
      if (error.message) {
        message = error.message;
      } else if (error.response?.data?.error) {
        message = error.response.data.error;
      }
      setError(message);
    },
  });

  const handleNext = () => {
    setError('');
    if (step === 1) {
      if (!organizationName.trim()) {
        setError('Vereinsname ist erforderlich');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      const { currentAdminPassword, currentConfirmPassword } = getCurrentPasswords();

      if (!adminUsername.trim()) {
        setError('Admin Benutzername ist erforderlich');
        return;
      }
      if (!adminEmail.trim()) {
        setError('Admin E-Mail ist erforderlich');
        return;
      }
      if (currentAdminPassword.length < 6) {
        setError('Passwort muss mindestens 6 Zeichen lang sein');
        return;
      }
      if (currentAdminPassword !== currentConfirmPassword) {
        setError('Passwörter stimmen nicht überein');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      handleComplete();
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setLogoFile(null);
      setLogoPreview('');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Bitte eine gültige Bilddatei auswählen');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Logo ist zu groß. Maximal erlaubt sind 5MB');
      return;
    }

    setError('');
    setLogoFile(file);

    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleComplete = () => {
    setupMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <img src="/teamvoteplus-logo.svg" alt="teamvote+" className="mx-auto h-16 sm:h-20 w-auto" />
          <p className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300">
            {step === 1 ? 'Dein Verein' : step === 2 ? 'Admin-Daten' : step === 3 ? 'Zeitzone' : 'Finale Zusammenfassung'}
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex justify-center space-x-2">
          <div className={`h-2 w-8 rounded-full transition-colors ${step >= 1 ? 'bg-primary-600' : 'bg-gray-300'}`} />
          <div className={`h-2 w-8 rounded-full transition-colors ${step >= 2 ? 'bg-primary-600' : 'bg-gray-300'}`} />
          <div className={`h-2 w-8 rounded-full transition-colors ${step >= 3 ? 'bg-primary-600' : 'bg-gray-300'}`} />
          <div className={`h-2 w-8 rounded-full transition-colors ${step >= 4 ? 'bg-primary-600' : 'bg-gray-300'}`} />
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <span className={step >= 1 ? 'text-primary-700 dark:text-primary-300 font-medium whitespace-nowrap' : 'text-gray-500 dark:text-gray-400 whitespace-nowrap'}>1 Verein</span>
          <span className={step >= 2 ? 'text-primary-700 dark:text-primary-300 font-medium whitespace-nowrap' : 'text-gray-500 dark:text-gray-400 whitespace-nowrap'}>2 Admin</span>
          <span className={step >= 3 ? 'text-primary-700 dark:text-primary-300 font-medium whitespace-nowrap' : 'text-gray-500 dark:text-gray-400 whitespace-nowrap'}>3 Zeitzone</span>
          <span className={step >= 4 ? 'text-primary-700 dark:text-primary-300 font-medium whitespace-nowrap' : 'text-gray-500 dark:text-gray-400 whitespace-nowrap'}>4 Zusammenf.</span>
        </div>

        <form className="mt-8 space-y-6" onSubmit={(e) => { e.preventDefault(); handleNext(); }}>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Organization */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="org-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Vereinsname
                </label>
                <input
                  id="org-name"
                  type="text"
                  required
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  className="input mt-1"
                  placeholder="z.B. SV Musterdorf"
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Dieser Name wird in Navigation, Login und Einladungen angezeigt.
                </p>
              </div>

              <div>
                <label htmlFor="org-short-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Kurzer Vereinsname (mobil, optional)
                </label>
                <input
                  id="org-short-name"
                  type="text"
                  value={organizationShortName}
                  onChange={(e) => setOrganizationShortName(e.target.value)}
                  className="input mt-1"
                  placeholder="z.B. SVM"
                  maxLength={32}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Wird bei Bedarf in der mobilen Navigation statt des langen Namens verwendet.
                </p>
              </div>

              <div>
                <label htmlFor="org-logo" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Vereinslogo (optional)
                </label>
                <input
                  id="org-logo"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="input mt-1"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Formate: JPG, PNG, GIF, WebP. Maximal 5MB. Kann später im Admin-Panel geändert werden.
                </p>
                {logoPreview && (
                  <div className="mt-3 flex items-center space-x-3">
                    <img src={resolveAssetUrl(logoPreview)} alt="Logo Vorschau" className="h-12 w-12 rounded object-contain bg-gray-700 border border-gray-600" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">{logoFile?.name}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Admin Account */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="admin-username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Admin Benutzername
                </label>
                <input
                  id="admin-username"
                  type="text"
                  required
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="input mt-1"
                  placeholder="admin"
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Damit meldest du dich später an (nur Kleinbuchstaben, Zahlen und Unterstrich).
                </p>
              </div>

              <div>
                <label htmlFor="admin-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Admin E-Mail
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="input mt-1"
                  placeholder="admin@verein.de"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Wird später für Passwort-Reset und Benachrichtigungen verwendet.
                </p>
              </div>

              <div>
                <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Passwort
                </label>
                <input
                  id="admin-password"
                  ref={adminPasswordRef}
                  type="password"
                  required
                  minLength={6}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onInput={(e) => setAdminPassword((e.target as HTMLInputElement).value)}
                  className="input mt-1"
                  placeholder="••••••••"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Empfehlung: mindestens 10 Zeichen mit Zahlen und Sonderzeichen.
                </p>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Passwort bestätigen
                </label>
                <input
                  id="confirm-password"
                  ref={confirmPasswordRef}
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onInput={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
                  className="input mt-1"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          {/* Step 3: Timezone */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Zeitzone
                </label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="input mt-1"
                  autoFocus
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Beeinflusst Terminzeiten, Deadlines und Erinnerungen.
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Final Summary */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Finale Zusammenfassung:</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300"><strong>Verein:</strong> {organizationName}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300"><strong>Kurzname:</strong> {organizationShortName.trim() || 'Nicht gesetzt'}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300"><strong>Logo:</strong> {logoFile ? 'Wird hochgeladen' : 'Kein Logo (optional)'}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300"><strong>Admin:</strong> {adminUsername} ({adminEmail})</p>
                <p className="text-sm text-gray-700 dark:text-gray-300"><strong>Zeitzone:</strong> {timezone}</p>
              </div>

              <p className="text-sm text-blue-200 bg-blue-900/30 border border-blue-800 p-3 rounded-lg">
                Hinweis: Nach dem Setup sind neue Registrierungen nur per persönlichem Einladungslink möglich.
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="flex-1 btn btn-secondary"
              >
                Zurück
              </button>
            )}
            <button
              type="submit"
              disabled={setupMutation.isPending}
              className="flex-1 btn btn-primary"
            >
              {setupMutation.isPending
                ? 'Wird konfiguriert...'
                : step < 4
                ? 'Weiter'
                : 'Setup abschließen'}
            </button>
          </div>

          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Schritt {step} von 4
          </p>
        </form>
      </div>
    </div>
  );
}
