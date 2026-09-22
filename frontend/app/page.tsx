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
      <h1>Dhaka Tesla Pool</h1>
      <p className="subtitle">Share a seat. Split the fare. Survive Dhaka traffic.</p>
    </main>
  );
}
