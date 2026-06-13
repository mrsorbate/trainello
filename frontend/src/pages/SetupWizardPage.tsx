import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Upload, Building2, Globe, Shield } from 'lucide-react';
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

interface SetupData {
  organizationName: string;
  organizationShortName: string;
  adminUsername: string;
  adminEmail: string;
  adminPassword: string;
  confirmPassword: string;
  timezone: string;
  logo: File | null;
}

export default function SetupWizardPage() {
  const [step, setStep] = useState(1);
  const [setupData, setSetupData] = useState<SetupData>({
    organizationName: '',
    organizationShortName: '',
    adminUsername: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
    timezone: 'Europe/Berlin',
    logo: null,
  });
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [error, setError] = useState('');

  const setupMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('auth-token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Step 1: Setup organization
      const setupResponse = await axios.post(`${API_URL}/api/admin/settings/setup`, {
        organizationName: setupData.organizationName,
        organizationShortName: setupData.organizationShortName.trim() ? setupData.organizationShortName.trim() : null,
        timezone: setupData.timezone,
      }, { headers });

      // Step 2: Upload logo if provided
      if (setupData.logo) {
        const formData = new FormData();
        formData.append('logo', setupData.logo);
        await axios.post(`${API_URL}/api/admin/upload/logo`, formData, {
          headers: { ...headers, 'Content-Type': 'multipart/form-data' },
        });
      }

      return setupResponse;
    },
    onSuccess: () => {
      // Redirect to dashboard
      window.location.href = '/';
    },
    onError: (error: any) => {
      setError(error.response?.data?.error || 'Setup fehlgeschlagen');
    },
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSetupData({ ...setupData, logo: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSetupData({ ...setupData, organizationName: e.target.value });
  };

  const handleTimezoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSetupData({ ...setupData, timezone: e.target.value });
  };

  const handleNext = () => {
    if (step === 1) {
      if (!setupData.organizationName.trim()) {
        setError('Vereinsname ist erforderlich');
        return;
      }
      setError('');
      setStep(2);
    } else if (step === 2) {
      if (!setupData.adminUsername.trim()) {
        setError('Admin Benutzername ist erforderlich');
        return;
      }
      if (!setupData.adminEmail.trim()) {
        setError('Admin E-Mail ist erforderlich');
        return;
      }
      if (setupData.adminPassword.length < 6) {
        setError('Passwort muss mindestens 6 Zeichen lang sein');
        return;
      }
      if (setupData.adminPassword !== setupData.confirmPassword) {
        setError('Passwörter stimmen nicht überein');
        return;
      }
      setError('');
      setStep(3);
    } else if (step === 3) {
      setError('');
      setStep(4);
    } else if (step === 4) {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (step > 1) {
      setStep(step - 1);
      setError('');
    }
  };

  const handleComplete = () => {
    setupMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 from-gray-900 to-gray-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">
            Willkommen bei teamvote+
          </h1>
          <p className="text-lg text-gray-300">
            {step === 1 ? 'Dein Verein' : step === 2 ? 'Admin-Daten' : step === 3 ? 'Zeitzone' : 'Finale Zusammenfassung'}
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="bg-gray-800 rounded-lg shadow-lg p-8 border border-gray-700">
          {/* Step Indicators */}
          <div className="flex items-center justify-between mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`flex items-center justify-center w-12 h-12 rounded-full font-bold ${
                  s <= step
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {s}
              </div>
              {s < 4 && (
                <div
                  className={`flex-1 h-1 mx-2 ${
                    s < step ? 'bg-primary-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
          </div>

          <div className="setup-stepper mb-8">
            <span className={`setup-stepper-item ${step >= 1 ? 'border-primary-700 bg-primary-900/30 text-primary-200' : 'border-gray-700 bg-gray-800 text-gray-400'}`}>1 Verein</span>
            <span className={`setup-stepper-item ${step >= 2 ? 'border-primary-700 bg-primary-900/30 text-primary-200' : 'border-gray-700 bg-gray-800 text-gray-400'}`}>2 Admin</span>
            <span className={`setup-stepper-item ${step >= 3 ? 'border-primary-700 bg-primary-900/30 text-primary-200' : 'border-gray-700 bg-gray-800 text-gray-400'}`}>3 Zeit</span>
            <span className={`setup-stepper-item ${step >= 4 ? 'border-primary-700 bg-primary-900/30 text-primary-200' : 'border-gray-700 bg-gray-800 text-gray-400'}`}>4 Fertig</span>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {/* Step 1: Organization Name & Logo */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Building2 className="w-6 h-6 text-primary-400" />
                Dein Verein
              </h2>

              <div>
                <label htmlFor="setup-organization-name" className="block text-sm font-medium text-gray-300 mb-2">
                  Vereinsname *
                </label>
                <input
                  id="setup-organization-name"
                  type="text"
                  value={setupData.organizationName}
                  onChange={handleNameChange}
                  placeholder="z.B. FC Bayern München"
                  className="input"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Dieser Name wird in der Navigation, auf Login-Seiten und in Einladungen angezeigt.
                </p>
              </div>

              <div>
                <label htmlFor="setup-organization-short-name" className="block text-sm font-medium text-gray-300 mb-2">
                  Kurzer Vereinsname (mobil, optional)
                </label>
                <input
                  id="setup-organization-short-name"
                  type="text"
                  value={setupData.organizationShortName}
                  onChange={(e) => setSetupData({ ...setupData, organizationShortName: e.target.value })}
                  placeholder="z.B. SVM"
                  className="input"
                  maxLength={32}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Wird bei Bedarf in der mobilen Navigation statt des langen Namens verwendet.
                </p>
              </div>

              <div>
                <label htmlFor="setup-organization-logo" className="block text-sm font-medium text-gray-300 mb-2">
                  <Upload className="w-4 h-4 inline mr-2" />
                  Vereins-Logo (optional)
                </label>
                <div className="flex">
                  <input
                    id="setup-organization-logo"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    title="Vereins-Logo auswählen"
                    aria-label="Vereins-Logo auswählen"
                    className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-primary-700/50 file:text-sm file:font-semibold file:bg-primary-900/40 file:text-primary-200 hover:file:bg-primary-900/60"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Maximal 5MB (JPG, PNG, GIF, WebP). Kann später im Admin-Panel geändert werden.
                </p>
                {logoPreview && (
                  <div className="mt-3 flex items-center gap-3">
                    <img src={resolveAssetUrl(logoPreview)} alt="Logo Vorschau" className="h-12 w-12 rounded object-contain border border-gray-600 bg-gray-700" />
                    <span className="text-sm text-gray-300">{setupData.logo?.name}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Admin Data */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Shield className="w-6 h-6 text-primary-400" />
                Admin-Daten
              </h2>

              <div>
                <label htmlFor="setup-admin-username" className="block text-sm font-medium text-gray-300 mb-2">Admin Benutzername *</label>
                <input
                  id="setup-admin-username"
                  type="text"
                  value={setupData.adminUsername}
                  onChange={(e) => setSetupData({ ...setupData, adminUsername: e.target.value })}
                  placeholder="z.B. admin"
                  className="input"
                />
                <p className="text-xs text-gray-400 mt-1">Damit meldest du dich später an (nur Kleinbuchstaben/Zahlen/Unterstrich).</p>
              </div>

              <div>
                <label htmlFor="setup-admin-email" className="block text-sm font-medium text-gray-300 mb-2">Admin E-Mail *</label>
                <input
                  id="setup-admin-email"
                  type="email"
                  value={setupData.adminEmail}
                  onChange={(e) => setSetupData({ ...setupData, adminEmail: e.target.value })}
                  placeholder="z.B. admin@verein.de"
                  className="input"
                />
                <p className="text-xs text-gray-400 mt-1">Wird für Passwort-Reset und Benachrichtigungen verwendet.</p>
              </div>

              <div>
                <label htmlFor="setup-admin-password" className="block text-sm font-medium text-gray-300 mb-2">Passwort *</label>
                <input
                  id="setup-admin-password"
                  type="password"
                  value={setupData.adminPassword}
                  onChange={(e) => setSetupData({ ...setupData, adminPassword: e.target.value })}
                  placeholder="Mindestens 6 Zeichen"
                  className="input"
                />
                <p className="text-xs text-gray-400 mt-1">Empfehlung: mindestens 10 Zeichen mit Zahlen und Sonderzeichen.</p>
              </div>

              <div>
                <label htmlFor="setup-confirm-password" className="block text-sm font-medium text-gray-300 mb-2">Passwort bestätigen *</label>
                <input
                  id="setup-confirm-password"
                  type="password"
                  value={setupData.confirmPassword}
                  onChange={(e) => setSetupData({ ...setupData, confirmPassword: e.target.value })}
                  placeholder="Passwort wiederholen"
                  className="input"
                />
              </div>
            </div>
          )}

          {/* Step 3: Timezone */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Globe className="w-6 h-6 text-primary-400" />
                Zeitzone
              </h2>

              <div>
                <label htmlFor="setup-timezone" className="block text-sm font-medium text-gray-300 mb-2">Zeitzone</label>
                <select
                  id="setup-timezone"
                  value={setupData.timezone}
                  onChange={handleTimezoneChange}
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
                <p className="text-xs text-gray-400 mt-1">Beeinflusst Terminzeiten, Deadlines und Erinnerungen.</p>
              </div>

            </div>
          )}

          {/* Step 4: Final Summary */}
          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Globe className="w-6 h-6 text-primary-400" />
                Finale Zusammenfassung
              </h2>

              <div className="p-4 bg-primary-900/20 rounded-lg border border-primary-800">
                <h3 className="font-bold text-primary-200 mb-2">Finale Zusammenfassung:</h3>
                <div className="space-y-1 text-sm text-primary-300">
                  <p>
                    <strong>Verein:</strong> {setupData.organizationName}
                  </p>
                  <p>
                    <strong>Kurzname:</strong> {setupData.organizationShortName.trim() || 'Nicht gesetzt'}
                  </p>
                  <p>
                    <strong>Admin:</strong> {setupData.adminUsername} ({setupData.adminEmail})
                  </p>
                  <p>
                    <strong>Zeitzone:</strong> {setupData.timezone}
                  </p>
                  {setupData.logo && (
                    <p>
                      <strong>Logo:</strong> Wird hochgeladen
                    </p>
                  )}
                  {!setupData.logo && (
                    <p>
                      <strong>Logo:</strong> Kein Logo (optional)
                    </p>
                  )}
                </div>
              </div>

              <p className="text-sm text-gray-300 bg-blue-900/20 p-3 rounded-lg">
                Hinweis: Nach dem Setup sind neue Registrierungen nur per persönlichem Einladungslink möglich.
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-4 mt-8">
            {step > 1 && (
              <button
                type="button"
                onClick={handlePrevious}
                disabled={setupMutation.isPending}
                className="flex-1 btn btn-secondary"
              >
                ← Zurück
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={setupMutation.isPending}
              className="flex-1 btn btn-primary"
            >
              {step === 4 && setupMutation.isPending && 'Wird eingerichtet...'}
              {step === 4 && !setupMutation.isPending && 'Setup fertigstellen'}
              {step < 4 && 'Weiter →'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-300 text-sm mt-8">
          Ihre Daten werden sicher auf Ihrem Server gespeichert
        </p>
      </div>
    </div>
  );
}
