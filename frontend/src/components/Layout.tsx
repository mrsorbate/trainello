import { useEffect } from 'react';
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

  useEffect(() => {
    let startY = 0;
    let isPulling = false;
    let hasTriggeredRefresh = false;
    const pullThreshold = 90;

    const onTouchStart = (event: TouchEvent) => {
      if (window.scrollY > 0) {
        isPulling = false;
        return;
      }
      startY = event.touches[0]?.clientY ?? 0;
      isPulling = true;
      hasTriggeredRefresh = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!isPulling || hasTriggeredRefresh) return;
      if (window.scrollY > 0) {
        isPulling = false;
        return;
      }
      const currentY = event.touches[0]?.clientY ?? startY;
      if (currentY - startY > pullThreshold) {
        hasTriggeredRefresh = true;
        window.location.reload();
      }
    };

    const onTouchEnd = () => {
      isPulling = false;
      hasTriggeredRefresh = false;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

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
      {/* ── Top navigation bar ── */}
      <nav className="bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/60 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      isActive('/') ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                    }`}
                  >
                    <Home className="w-4 h-4" />
                    <span>Dashboard</span>
                  </Link>
                )}
                {user?.role === 'admin' && (
                  <Link
                    to="/admin"
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      isActive('/admin') ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    <span>Admin-Panel</span>
                  </Link>
                )}
                {user?.role !== 'admin' && (
                  <Link
                    to="/events"
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      isActive('/events') ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Meine Termine</span>
                  </Link>
                )}
                {user?.role !== 'admin' && (
                  <Link
                    to="/meine-tabelle"
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      isActive('/meine-tabelle') ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Meine Tabelle</span>
                  </Link>
                )}
                {user?.role !== 'admin' && (
                  <Link
                    to="/teams"
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                      isActive('/teams') ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>{teamsMenuLabel}</span>
                  </Link>
                )}
              </div>

              {/* Desktop: Profile + Logout */}
              <div className="hidden md:flex items-center gap-2 pl-2">
                <Link to="/settings" aria-label="Zu den Einstellungen">
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
                  className="flex items-center justify-center w-9 h-9 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                  aria-label="Logout"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>

              {/* Mobile: Profile avatar only */}
              <div className="md:hidden flex items-center pr-1">
                <Link to="/settings" aria-label="Zu den Einstellungen">
                  {menuProfilePicture ? (
                    <img
                      src={resolveAssetUrl(menuProfilePicture)}
                      alt="Profilbild"
                      className="w-8 h-8 rounded-full object-cover border-2 border-gray-700 hover:border-primary-500 transition-colors"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-700 border-2 border-gray-700 flex items-center justify-center">
                      <UserIcon className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Page content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-24 md:pb-8">
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
            >
              <Home className="w-5 h-5" strokeWidth={isActive('/') ? 2.5 : 1.8} />
              <span className="bottom-nav-label">Start</span>
            </Link>
            <Link
              to="/events"
              className={`bottom-nav-item ${isActive('/events') ? 'active' : ''}`}
              aria-label="Termine"
            >
              <Calendar className="w-5 h-5" strokeWidth={isActive('/events') ? 2.5 : 1.8} />
              <span className="bottom-nav-label">Termine</span>
            </Link>
            <Link
              to="/teams"
              className={`bottom-nav-item ${isActive('/teams') ? 'active' : ''}`}
              aria-label="Teams"
            >
              <Users className="w-5 h-5" strokeWidth={isActive('/teams') ? 2.5 : 1.8} />
              <span className="bottom-nav-label">Teams</span>
            </Link>
            <Link
              to="/meine-tabelle"
              className={`bottom-nav-item ${isActive('/meine-tabelle') ? 'active' : ''}`}
              aria-label="Tabelle"
            >
              <BarChart3 className="w-5 h-5" strokeWidth={isActive('/meine-tabelle') ? 2.5 : 1.8} />
              <span className="bottom-nav-label">Tabelle</span>
            </Link>
            <Link
              to="/settings"
              className={`bottom-nav-item ${isActive('/settings') ? 'active' : ''}`}
              aria-label="Profil"
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
            >
              <Shield className="w-5 h-5" strokeWidth={isActive('/admin') ? 2.5 : 1.8} />
              <span className="bottom-nav-label">Admin</span>
            </Link>
            <Link
              to="/settings"
              className={`bottom-nav-item ${isActive('/settings') ? 'active' : ''}`}
              aria-label="Profil"
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
