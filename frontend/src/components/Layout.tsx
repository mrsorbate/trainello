import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { LogOut, User as UserIcon, Users, Shield, Home, BarChart3, Calendar } from 'lucide-react';
import { resolveAssetUrl } from '../lib/utils';
import { profileAPI, teamsAPI } from '../lib/api';
import PushInstallPrompt from './PushInstallPrompt';

interface Organization {
  id: number;
  name: string;
  short_name?: string | null;
  logo?: string;
  timezone: string;
  setup_completed: number;
}

interface LayoutProps {
  organization?: Organization | null;
}

export default function Layout({ organization }: LayoutProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const organizationName = organization?.name || 'Dein Verein';
  const organizationShortName = String(organization?.short_name || '').trim();
  const organizationNameMobile = organizationShortName || organizationName;
  const organizationLogo = organization?.logo;

  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await teamsAPI.getAll();
      return response.data;
    },
    enabled: user?.role !== 'admin',
  });

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const response = await profileAPI.getProfile();
      return response.data;
    },
    enabled: !!user,
  });

  const teamsMenuLabel = teams?.length === 1 ? 'Mein Team' : 'Meine Teams';
  const menuProfilePicture = profile?.profile_picture || user?.profile_picture;

  return (
    <div className="min-h-screen bg-gray-900">
      {/* ── Skip to main content (keyboard / screen reader) ── */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[70] focus:top-3 focus:left-3 focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-modal focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
      >
        Zum Hauptinhalt springen
      </a>

      {/* ── Top navigation bar ── */}
      <nav className="bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/60 sticky top-0 z-30 pt-safe">
        <div className="max-w-7xl mx-auto px-safe sm:px-6 lg:px-8">
          <div className="flex justify-between min-h-[3.25rem] sm:h-14">

            {/* Left: Logo + Org */}
            <div className="flex items-center min-w-0 flex-1">
              <Link
                to={user?.role === 'admin' ? '/admin' : '/'}
                className="flex items-center gap-2 min-w-0"
                aria-label="Zur Startseite"
              >
                <img src="/teamvoteplus-logo.svg" alt="teamvote+" className="h-6 w-auto shrink-0" />
                <div className="flex items-center gap-1.5 min-w-0">
                  {(organizationLogo || organizationName !== 'Dein Verein') && (
                    <>
                      <span className="hidden min-[390px]:inline text-gray-600">·</span>
                      {organizationLogo && (
                        <img
                          src={resolveAssetUrl(organizationLogo)}
                          alt="Vereinslogo"
                          className="h-5 sm:h-6 w-auto object-contain shrink-0"
                        />
                      )}
                      {organizationName !== 'Dein Verein' && (
                        <>
                          <span className="hidden min-[390px]:block sm:hidden text-xs font-medium text-gray-400 truncate max-w-[95px]">
                            {organizationNameMobile}
                          </span>
                          <span className="hidden sm:block text-sm font-medium text-gray-400 truncate max-w-[220px]">
                            {organizationName}
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </Link>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-1 shrink-0">

              {/* Desktop nav links */}
              <div className="hidden md:flex items-center gap-0.5">
                {user?.role !== 'admin' && (
                  <Link
                    to="/"
                    aria-current={isActive('/') ? 'page' : undefined}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      isActive('/') ? 'text-primary-400 bg-gray-700/60 font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40'
                    }`}
                  >
                    <Home className="w-4 h-4" />
                    <span>Dashboard</span>
                  </Link>
                )}
                {user?.role === 'admin' && (
                  <Link
                    to="/admin"
                    aria-current={isActive('/admin') ? 'page' : undefined}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      isActive('/admin') ? 'text-primary-400 bg-gray-700/60 font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    <span>Admin-Panel</span>
                  </Link>
                )}
                {user?.role !== 'admin' && (
                  <Link
                    to="/events"
                    aria-current={isActive('/events') ? 'page' : undefined}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      isActive('/events') ? 'text-primary-400 bg-gray-700/60 font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40'
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Meine Termine</span>
                  </Link>
                )}
                {user?.role !== 'admin' && (
                  <Link
                    to="/meine-tabelle"
                    aria-current={isActive('/meine-tabelle') ? 'page' : undefined}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      isActive('/meine-tabelle') ? 'text-primary-400 bg-gray-700/60 font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Meine Tabelle</span>
                  </Link>
                )}
                {user?.role !== 'admin' && (
                  <Link
                    to="/teams"
                    aria-current={isActive('/teams') ? 'page' : undefined}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      isActive('/teams') ? 'text-primary-400 bg-gray-700/60 font-semibold' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>{teamsMenuLabel}</span>
                  </Link>
                )}
              </div>

              {/* Desktop: Profile + Logout */}
              <div className="hidden md:flex items-center gap-2 pl-2">
                <Link to="/settings" aria-label="Zu den Einstellungen" className="icon-button rounded-full">
                  {menuProfilePicture ? (
                    <img
                      src={resolveAssetUrl(menuProfilePicture)}
                      alt="Profilbild"
                      className="w-8 h-8 rounded-full object-cover border-2 border-gray-600 hover:border-primary-500 transition-colors"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-700 border-2 border-gray-600 hover:border-primary-500 flex items-center justify-center transition-colors">
                      <UserIcon className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                </Link>
                <button
                  onClick={handleLogout}
                  className="icon-button"
                  aria-label="Logout"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>

            </div>
          </div>
        </div>
      </nav>

      {/* ── Page content ── */}
      <main id="main-content" className="max-w-7xl mx-auto px-safe sm:px-6 lg:px-8 pt-4 sm:pt-6 pwa-main-safe">
        <Outlet />
      </main>

      <PushInstallPrompt userId={user?.id} />

      {/* ── Mobile bottom tab bar ── */}
      <nav className="bottom-nav md:hidden" aria-label="Hauptnavigation">
        {user?.role !== 'admin' ? (
          <>
            <Link
              to="/"
              className={`bottom-nav-item ${isActive('/') ? 'active' : ''}`}
              aria-label="Start"
              aria-current={isActive('/') ? 'page' : undefined}
            >
              <Home className="w-5 h-5" strokeWidth={isActive('/') ? 2.5 : 1.8} />
              <span className="bottom-nav-label">Start</span>
            </Link>
            <Link
              to="/events"
              className={`bottom-nav-item ${isActive('/events') ? 'active' : ''}`}
              aria-label="Termine"
              aria-current={isActive('/events') ? 'page' : undefined}
            >
              <Calendar className="w-5 h-5" strokeWidth={isActive('/events') ? 2.5 : 1.8} />
              <span className="bottom-nav-label">Termine</span>
            </Link>
            <Link
              to="/teams"
              className={`bottom-nav-item ${isActive('/teams') ? 'active' : ''}`}
              aria-label="Teams"
              aria-current={isActive('/teams') ? 'page' : undefined}
            >
              <Users className="w-5 h-5" strokeWidth={isActive('/teams') ? 2.5 : 1.8} />
              <span className="bottom-nav-label">Teams</span>
            </Link>
            <Link
              to="/meine-tabelle"
              className={`bottom-nav-item ${isActive('/meine-tabelle') ? 'active' : ''}`}
              aria-label="Tabelle"
              aria-current={isActive('/meine-tabelle') ? 'page' : undefined}
            >
              <BarChart3 className="w-5 h-5" strokeWidth={isActive('/meine-tabelle') ? 2.5 : 1.8} />
              <span className="bottom-nav-label">Tabelle</span>
            </Link>
            <Link
              to="/settings"
              className={`bottom-nav-item ${isActive('/settings') ? 'active' : ''}`}
              aria-label="Profil"
              aria-current={isActive('/settings') ? 'page' : undefined}
            >
              {menuProfilePicture ? (
                <img
                  src={resolveAssetUrl(menuProfilePicture)}
                  alt=""
                  className={`w-5 h-5 rounded-full object-cover ${isActive('/settings') ? 'ring-2 ring-primary-400' : ''}`}
                />
              ) : (
                <UserIcon className="w-5 h-5" strokeWidth={isActive('/settings') ? 2.5 : 1.8} />
              )}
              <span className="bottom-nav-label">Profil</span>
            </Link>
          </>
        ) : (
          <>
            <Link
              to="/admin"
              className={`bottom-nav-item ${isActive('/admin') ? 'active' : ''}`}
              aria-label="Admin"
              aria-current={isActive('/admin') ? 'page' : undefined}
            >
              <Shield className="w-5 h-5" strokeWidth={isActive('/admin') ? 2.5 : 1.8} />
              <span className="bottom-nav-label">Admin</span>
            </Link>
            <Link
              to="/settings"
              className={`bottom-nav-item ${isActive('/settings') ? 'active' : ''}`}
              aria-label="Profil"
              aria-current={isActive('/settings') ? 'page' : undefined}
            >
              <UserIcon className="w-5 h-5" strokeWidth={isActive('/settings') ? 2.5 : 1.8} />
              <span className="bottom-nav-label">Profil</span>
            </Link>
            <button
              onClick={handleLogout}
              className="bottom-nav-item"
              aria-label="Logout"
            >
              <LogOut className="w-5 h-5" strokeWidth={1.8} />
              <span className="bottom-nav-label">Logout</span>
            </button>
          </>
        )}
      </nav>
    </div>
  );
}
