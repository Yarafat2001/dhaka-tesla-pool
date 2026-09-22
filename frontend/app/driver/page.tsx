'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearToken, getStoredUser } from '@/lib/api';

interface RideRequest {
  id: string;
  seats: number;
  status: string;
  estimatedFarePoisha: number;
  passenger: { name: string };
  pickupZone: { name: string };
  dropoffZone: { name: string };
}
interface Pool { id: string; status: string; seatsUsed: number; rideRequests: RideRequest[]; }
interface Tesla { id: string; name: string; capacity: number; isOnline: boolean; pools: Pool[]; }

function fmt(poisha: number) {
  return `৳${(poisha / 100).toFixed(2)}`;
}

export default function DriverPage() {
  const router = useRouter();
  const [tesla, setTesla] = useState<Tesla | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = getStoredUser();

  const refresh = useCallback(async () => {
    const t = await api.myTesla();
    setTesla(t);
  }, []);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    refresh().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleOnline() {
    if (!tesla) return;
    try {
      await api.setOnline(!tesla.isOnline);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  }

  async function act(action: 'arrive' | 'start' | 'complete', poolId: string) {
    try {
      if (action === 'arrive') await api.arrive(poolId);
      if (action === 'start') await api.start(poolId);
      if (action === 'complete') await api.complete(poolId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  }

  return (
    <main className="page">
      <div className="top-nav">
        <div>
          <h1>Hi, {user?.name}</h1>
          <p className="subtitle">{tesla ? `${tesla.name} · ${tesla.capacity} seats` : 'Loading...'}</p>
        </div>
        <button
          className="secondary"
          style={{ width: 'auto', marginTop: 0 }}
          onClick={() => { clearToken(); router.push('/login'); }}
        >
          Sign out
        </button>
      </div>

      {tesla && (
        <div className="card">
          <div className="row">
            <span>Status</span>
            <span className={tesla.isOnline ? 'badge MATCHED' : 'badge'}>
              {tesla.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <button onClick={toggleOnline}>{tesla.isOnline ? 'Go offline' : 'Go online'}</button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <h2>Active pools</h2>
      {(!tesla || tesla.pools.length === 0) && (
        <p className="muted">No active pool. Go online and wait for passengers to request rides.</p>
      )}
      {tesla?.pools.map((pool) => (
        <div className="card" key={pool.id}>
          <div className="row">
            <span className={`badge ${pool.status === 'ACTIVE' ? 'STARTED' : pool.status}`}>{pool.status}</span>
            <span className="muted">{pool.seatsUsed}/{tesla.capacity} seats</span>
          </div>
          {pool.rideRequests.map((r) => (
            <div key={r.id} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <div className="row">
                <strong>{r.passenger.name}</strong>
                <span className={`badge ${r.status}`}>{r.status}</span>
              </div>
              <p className="muted">
                {r.pickupZone.name} &rarr; {r.dropoffZone.name} &middot; {r.seats} seat(s) &middot; {fmt(r.estimatedFarePoisha)}
              </p>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => act('arrive', pool.id)}>Arrived</button>
            <button onClick={() => act('start', pool.id)}>Start trip</button>
            <button onClick={() => act('complete', pool.id)}>Complete</button>
          </div>
        </div>
      ))}
    </main>
  );
}
