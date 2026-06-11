import { useEffect, useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { LogOut, User as UserIcon, Menu, X, Users, Shield, Home } from 'lucide-react';
import { resolveAssetUrl } from '../lib/utils';
import { profileAPI, teamsAPI } from '../lib/api';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      if (!isPulling || hasTriggeredRefresh) {
        return;
      }

      if (window.scrollY > 0) {
        isPulling = false;
        return;
      }

      const currentY = event.touches[0]?.clientY ?? startY;
      const delta = currentY - startY;

      if (delta > pullThreshold) {
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
  const firstName = user?.name?.trim().split(/\s+/)[0] || user?.name || '';

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between min-h-[3.5rem] sm:h-16 py-1 sm:py-0">
            <div className="flex items-center min-w-0 flex-1">
              <Link to={user?.role === 'admin' ? '/admin' : '/'} className="flex items-center space-x-2 min-w-0">
                <img src="/teamvoteplus-logo.svg" alt="teamvote+" className="h-6 w-auto shrink-0" />
                <div className="flex items-center space-x-1 sm:space-x-2 min-w-0">
                  {(organizationLogo || organizationName !== 'Dein Verein') && (
                    <>
                      <span className="hidden min-[390px]:inline text-gray-400 dark:text-gray-500">-</span>
                      {organizationLogo && (
                        <img 
                          src={resolveAssetUrl(organizationLogo)} 
                          alt="Vereinslogo" 
                          className="h-5 sm:h-6 w-auto object-contain flex-shrink-0"
                        />
                      )}
                      {organizationName !== 'Dein Verein' && (
                        <>
                          <span className="hidden min-[390px]:block sm:hidden text-xs font-medium text-gray-600 dark:text-gray-400 leading-tight max-w-[95px] truncate whitespace-nowrap">{organizationNameMobile}</span>
                          <span className="hidden sm:block text-sm font-medium text-gray-600 dark:text-gray-400 leading-tight max-w-[220px] truncate whitespace-nowrap">{organizationName}</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </Link>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4 shrink-0 pl-2">
              <div className="hidden md:flex items-center space-x-1">
                {user?.role !== 'admin' && (
                  <Link
                    to="/"
                    className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Home className="w-4 h-4" />
                    <span>Dashboard</span>
                  </Link>
                )}
                {user?.role === 'admin' && (
                  <Link
                    to="/admin"
                    className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Shield className="w-4 h-4" />
                    <span>Admin-Panel</span>
                  </Link>
                )}
                {user?.role !== 'admin' && (
                  <Link
                    to="/teams"
                    className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Users className="w-4 h-4" />
                    <span>{teamsMenuLabel}</span>
                  </Link>
                )}
              </div>
              <div className="md:hidden flex items-center space-x-1.5 text-sm text-gray-700 dark:text-gray-300 min-w-0">
                {menuProfilePicture ? (
                  <Link to="/settings" aria-label="Zu den Einstellungen">
                    <img
                      src={resolveAssetUrl(menuProfilePicture)}
                      alt="Profilbild"
                      className="w-6 h-6 min-[390px]:w-7 min-[390px]:h-7 rounded-full object-cover border border-gray-300 dark:border-gray-600 hover:opacity-90"
                    />
                  </Link>
                ) : (
                  <Link to="/settings" aria-label="Zu den Einstellungen">
                    <div className="w-6 h-6 min-[390px]:w-7 min-[390px]:h-7 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center hover:opacity-90">
                      <UserIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </div>
                  </Link>
                )}
                <div className="flex items-center gap-1 min-w-0">
                  <Link to="/settings" className="font-medium truncate max-w-[64px] min-[390px]:max-w-[90px] hover:underline">
                    {firstName}
                  </Link>
                </div>
              </div>
              <div className="hidden md:flex items-center space-x-3 px-2">
                {menuProfilePicture ? (
                  <Link to="/settings" aria-label="Zu den Einstellungen">
                    <img
                      src={resolveAssetUrl(menuProfilePicture)}
                      alt="Profilbild"
                      className="w-8 h-8 rounded-full object-cover border-2 border-gray-300 dark:border-gray-600 hover:opacity-90"
                    />
                  </Link>
                ) : (
                  <Link to="/settings" aria-label="Zu den Einstellungen">
                    <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center hover:opacity-90">
                      <UserIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </div>
                  </Link>
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  <Link to="/settings" className="font-medium hover:underline">
                    {firstName}
                  </Link>
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="hidden md:flex items-center justify-center px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="md:hidden inline-flex items-center justify-center p-2.5 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Menue"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden border-t border-gray-200 dark:border-gray-700 py-3 space-y-2 bg-white dark:bg-gray-800">
              <Link
                to="/"
                className="flex items-center space-x-2 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Home className="w-4 h-4" />
                <span>Dashboard</span>
              </Link>
              {user?.role === 'admin' && (
                <Link
                  to="/admin"
                  className="flex items-center space-x-2 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin-Panel</span>
                </Link>
              )}
              {user?.role !== 'admin' && (
                <Link
                  to="/teams"
                  className="flex items-center space-x-2 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Users className="w-4 h-4" />
                  <span>{teamsMenuLabel}</span>
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="flex w-full items-center space-x-2 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
