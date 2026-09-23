'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import BrandLogo from './BrandLogo';
import ThemeToggle from './ThemeToggle';
import { clearToken, getStoredUser } from '@/lib/api';

export default function AppNav({ active }: { active?: 'passenger' | 'driver' }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; name: string; role: string } | null>(null);
  useEffect(() => {
    setUser(getStoredUser());
    function onStorage(e: StorageEvent) {
      if (!e.key || e.key === 'user' || e.key === 'token') setUser(getStoredUser());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [pathname]);
  const cur = active ?? (pathname.startsWith('/driver') ? 'driver' : pathname.startsWith('/passenger') ? 'passenger' : undefined);
  const onAuthPage = pathname === '/login' || pathname === '/signup' || pathname === '/';
  // Logo always lands somewhere sensible: logged-out users go to /login,
  // logged-in users go to their own dashboard (role-aware home).
  const homeHref = !user ? '/login' : user.role === 'DRIVER' ? '/driver' : '/passenger';
  function signOut() {
    clearToken();
    setUser(null);
    router.push('/login');
    router.refresh();
  }
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href={homeHref} className="nav-brand" aria-label="Dhaka Tesla Pool home — go to sign in">
          <BrandLogo height={38} />
          <span className="nav-name">Dhaka Tesla Pool<small>Share a seat · Split the fare</small></span>
        </Link>
        {!onAuthPage && (
          <nav className="nav-links" aria-label="Primary">
            {(!user || user.role !== 'DRIVER') && (
              <Link href="/passenger" className={cur === 'passenger' ? 'active' : ''}>Ride</Link>
            )}
            {(!user || user.role !== 'PASSENGER') && (
              <Link href="/driver" className={cur === 'driver' ? 'active' : ''}>Drive</Link>
            )}
          </nav>
        )}
        <div className="nav-user">
          <ThemeToggle />
          {user && <span className="nav-hello">Hi, {user.name}</span>}
          {user ? (
            <button type="button" className="btn-primary sm" onClick={signOut}>Sign out</button>
          ) : (
            pathname === '/signup' ? (
              <Link href="/login" className="btn-primary sm">Sign in</Link>
            ) : pathname === '/login' ? (
              <Link href="/signup" className="btn-ghost sm">Sign up</Link>
            ) : (
              <Link href="/login" className="btn-primary sm">Sign in</Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}

