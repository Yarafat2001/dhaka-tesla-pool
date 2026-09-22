'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace('/login');
    } else {
      router.replace(user.role === 'DRIVER' ? '/driver' : '/passenger');
    }
  }, [router]);
  return (
    <main className="page">
      <div className="splash">
        <div className="avatar logo">⚡</div>
        <h1>Dhaka Tesla Pool</h1>
        <p className="subtitle" style={{ marginBottom: 0 }}>
          Share a seat. Split the fare. Survive Dhaka traffic.
        </p>
        <span className="spin" aria-hidden="true" />
        <p className="muted" style={{ marginTop: 10 }}>Taking you to your ride&hellip;</p>
      </div>
    </main>
  );
}
