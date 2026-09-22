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
interface HistoryPassenger {
  name: string;
  seats: number;
  status: string;
  from: string;
  to: string;
  farePoisha: number;
  paymentMethod: string;
  paymentStatus: string;
}
interface HistoryPool {
  id: string;
  status: string;
  seatsUsed: number;
  startedAt: string;
  finishedAt: string;
  totalEarnedPoisha: number;
  passengers: HistoryPassenger[];
}
interface DriverHistory {
  tesla: { id: string; name: string; capacity: number };
  pools: HistoryPool[];
}

function fmt(poisha: number) {
  return `৳${(poisha / 100).toFixed(2)}`;
}

export default function DriverPage() {
  const router = useRouter();
  const [tesla, setTesla] = useState<Tesla | null>(null);
  const [history, setHistory] = useState<DriverHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const user = getStoredUser();

  const refresh = useCallback(async () => {
    const [t, h] = await Promise.all([api.myTesla(), api.driverHistory()]);
    setTesla(t);
    setHistory(h);
  }, []);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    refresh()
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
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

  async function act(action: 'accept' | 'arrive' | 'start' | 'complete', poolId: string) {
    try {
      if (action === 'accept') await api.accept(poolId);
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
      {loading && <p className="muted">Loading your Tesla...</p>}
      {!loading && (!tesla || tesla.pools.length === 0) && (
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
            {pool.status === 'FORMING' && (
              <button onClick={() => act('accept', pool.id)}>Accept pool</button>
            )}
            {pool.status === 'ACCEPTED' && (
              <>
                <button onClick={() => act('arrive', pool.id)}>Arrived</button>
                <button onClick={() => act('start', pool.id)}>Start trip</button>
              </>
            )}
            {pool.status === 'ACTIVE' && (
              <button onClick={() => act('complete', pool.id)}>Complete</button>
            )}
          </div>
        </div>
      ))}

      <h2>Trip history</h2>
      {loading && <p className="muted">Loading trip history...</p>}
      {!loading && history?.pools.length === 0 && (
        <p className="muted">No finished trips yet.</p>
      )}
      {history?.pools.map((pool) => (
        <div className="card" key={pool.id}>
          <div className="row">
            <span className={`badge ${pool.status}`}>{pool.status}</span>
            <span>{fmt(pool.totalEarnedPoisha)} earned</span>
          </div>
          <p className="muted">
            {pool.seatsUsed} seat(s) &middot; finished {new Date(pool.finishedAt).toLocaleString()}
          </p>
          {pool.passengers.map((p, i) => (
            <div key={i} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <div className="row">
                <strong>{p.name}</strong>
                <span className="muted">
                  {fmt(p.farePoisha)} &middot; {p.paymentMethod}/{p.paymentStatus}
                </span>
              </div>
              <p className="muted">
                {p.from} &rarr; {p.to} &middot; {p.seats} seat(s) &middot; {p.status}
              </p>
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}
