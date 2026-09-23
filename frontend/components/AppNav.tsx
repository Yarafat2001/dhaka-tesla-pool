'use client';
import Link from 'next/link';
import BrandLogo from './BrandLogo';
import ThemeToggle from './ThemeToggle';
import { clearToken, getStoredUser } from '@/lib/api';

export default function AppNav({ active }: { active?: 'passenger' | 'driver' }) {
  const pathname = typeof window === 'undefined' ? '' : window.location.pathname;
  const cur = active ?? (pathname.startsWith('/driver') ? 'driver' : pathname.startsWith('/passenger') ? 'passenger' : undefined);
  const user = typeof window === 'undefined' ? null : getStoredUser();
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-brand">
          <BrandLogo height={38} />
          <span className="nav-name">Dhaka Tesla Pool<small>Share a seat · Split the fare</small></span>
        </Link>
        <nav className="nav-links">
          <Link href="/passenger" className={cur === 'passenger' ? 'active' : ''}>Ride</Link>
          <Link href="/driver" className={cur === 'driver' ? 'active' : ''}>Drive</Link>
        </nav>
        <div className="nav-user">
          <ThemeToggle />
          {user && <span className="nav-hello">Hi, {user.name}</span>}
          {user ? (
            <a className="btn-ghost sm" href="/login" onClick={(e) => { e.preventDefault(); clearToken(); window.location.href = '/login'; }}>Sign out</a>
          ) : (
            <Link href="/login" className="btn-primary sm">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}

