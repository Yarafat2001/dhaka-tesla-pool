'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearToken, getStoredUser } from '@/lib/api';
import { useToasts } from '@/lib/toasts';
import BrandLogo from '@/components/BrandLogo';

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

// Driver-facing pool lifecycle: mirrors the backend PoolStatus enum so the same
// stepper vocabulary appears on both role screens.
const POOL_STEPS = ['Forming', 'Accepted', 'Started', 'Completed'];
const POOL_STEP_INDEX: Record<string, number> = {
  FORMING: 0,
  ACCEPTED: 1,
  ACTIVE: 2,
  COMPLETED: 3,
};

// Success copy for each lifecycle action - shown as a toast after refresh().
const ACT_MSG: Record<'accept' | 'arrive' | 'start' | 'complete', string> = {
  accept: 'Pool accepted - it is yours now',
  arrive: 'Arrival marked - passengers are waiting',
  start: 'Trip started - drive safe',
  complete: 'Trip completed - fares are settled',
};

export default function DriverPage() {
  const router = useRouter();
  const [tesla, setTesla] = useState<Tesla | null>(null);
  const [history, setHistory] = useState<DriverHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const user = getStoredUser();
  const { push, view: toastsView } = useToasts();
  // In-flight action key ("online" | `${poolId}:${action}`) -> spinner/disabled buttons.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const seatsUsed = tesla?.pools.reduce((sum, p) => sum + p.seatsUsed, 0) ?? 0;

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
    if (!tesla || busyKey) return;
    setBusyKey('online');
    try {
      await api.setOnline(!tesla.isOnline);
      await refresh();
      // tesla still holds the pre-toggle value inside this closure
      push('ok', tesla.isOnline ? 'You are offline' : 'You are online - you will receive pools');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      setError(msg);
      push('err', msg);
    } finally {
      setBusyKey(null);
    }
  }

  async function act(action: 'accept' | 'arrive' | 'start' | 'complete', poolId: string) {
    if (busyKey) return;
    setBusyKey(`${poolId}:${action}`);
    try {
      if (action === 'accept') await api.accept(poolId);
      if (action === 'arrive') await api.arrive(poolId);
      if (action === 'start') await api.start(poolId);
      if (action === 'complete') await api.complete(poolId);
      await refresh();
      push('ok', ACT_MSG[action]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      setError(msg);
      push('err', msg);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <main className="page">
      {toastsView}
      <div className="top-nav">
        <div className="row" style={{ justifyContent: 'flex-start', gap: 12 }}>
          <BrandLogo height={38} />
          <div>
            <h1>Hi, {user?.name}</h1>
            <p className="subtitle" style={{ marginBottom: 0 }}>
              {tesla ? `Driver · ${tesla.name} · ${tesla.capacity} seats` : 'Loading...'}
            </p>
          </div>
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
        <div className="card appear">
          <div className="row">
            <div className="row" style={{ justifyContent: 'flex-start', gap: 12 }}>
              <span className="avatar">⚡</span>
              <div>
                <strong>{tesla.isOnline ? 'Online' : 'Offline'}</strong>
                <div className="seat-dots" style={{ marginTop: 7 }} title={`${seatsUsed}/${tesla.capacity} seats occupied`}>
                  {Array.from({ length: tesla.capacity }, (_, i) => (
                    <span key={i} className={`seat-dot ${i < seatsUsed ? 'filled' : ''}`} />
                  ))}
                </div>
              </div>
            </div>
            <label className="switch" title={tesla.isOnline ? 'Go offline' : 'Go online'}>
              <input
                type="checkbox"
                checked={tesla.isOnline}
                disabled={busyKey !== null}
                onChange={() => void toggleOnline()}
              />
              <span className="slider" />
            </label>
          </div>
          <p className="muted" style={{ margin: '12px 0 0' }}>
            {tesla.isOnline
              ? 'Online - passengers requesting compatible routes can pool into this Tesla.'
              : 'Offline - flip the switch to start receiving pools.'}
          </p>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <h2>Active pools</h2>
      <p className="muted section-note">
        Accept a pool to lock it in, then drive the lifecycle: arrived &rarr; start &rarr; complete.
      </p>
      {loading && <p className="muted">Loading your Tesla...</p>}
      {!loading && (!tesla || tesla.pools.length === 0) && (
        <div className="empty">
          <span className="empty-icon">🛺</span>
          No active pool. Go online and wait for passengers to request rides.
        </div>
      )}
      {tesla?.pools.map((pool) => (
        <div className="card" key={pool.id}>
          <div className="row">
            <span className={`badge ${pool.status === 'ACTIVE' ? 'STARTED' : pool.status === 'FORMING' ? 'REQUESTED' : pool.status}`}>
              {pool.status}
            </span>
            <span className="seat-dots" title={`${pool.seatsUsed}/${tesla.capacity} seats`}>
              {Array.from({ length: tesla.capacity }, (_, i) => (
                <span key={i} className={`seat-dot ${i < pool.seatsUsed ? 'filled' : ''}`} />
              ))}
            </span>
          </div>

          <div className="stepper">
            {POOL_STEPS.map((label, i) => {
              const idx = POOL_STEP_INDEX[pool.status] ?? 0;
              const cls = i < idx || idx === POOL_STEPS.length - 1 ? 'done' : i === idx ? 'current' : '';
              return (
                <span key={label} className={`step ${cls}`}>
                  <span className="dot" />
                  {label}
                </span>
              );
            })}
          </div>

          {pool.rideRequests.map((r) => (
            <div className="rider" key={r.id}>
              <span className="avatar sm">{r.passenger.name.charAt(0)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row">
                  <strong>{r.passenger.name}</strong>
                  <span className={`badge ${r.status}`}>{r.status}</span>
                </div>
                <div className="route">
                  {r.pickupZone.name} <span className="arrow">&rarr;</span> {r.dropoffZone.name}
                  &nbsp;&middot; {r.seats} seat(s) &middot; <span className="money">{fmt(r.estimatedFarePoisha)}</span>
                </div>
              </div>
            </div>
          ))}

          <div className="btn-row">
            {pool.status === 'FORMING' && (
              <button
                className={busyKey === `${pool.id}:accept` ? 'loading' : ''}
                disabled={busyKey !== null}
                onClick={() => act('accept', pool.id)}
              >
                Accept pool
              </button>
            )}
            {pool.status === 'ACCEPTED' && (
              <>
                <button
                  className="secondary"
                  disabled={busyKey !== null}
                  onClick={() => act('arrive', pool.id)}
                >
                  Arrived
                </button>
                <button
                  className={busyKey === `${pool.id}:start` ? 'loading' : ''}
                  disabled={busyKey !== null}
                  onClick={() => act('start', pool.id)}
                >
                  Start trip
                </button>
              </>
            )}
            {pool.status === 'ACTIVE' && (
              <button
                className={busyKey === `${pool.id}:complete` ? 'loading' : ''}
                disabled={busyKey !== null}
                onClick={() => act('complete', pool.id)}
              >
                Complete
              </button>
            )}
          </div>
        </div>
      ))}

      <h2>Trip history</h2>
      {loading && <p className="muted">Loading trip history...</p>}
      {!loading && history?.pools.length === 0 && (
        <div className="empty">
          <span className="empty-icon">📒</span>
          No finished trips yet - completed pools will be archived here.
        </div>
      )}
      {history?.pools.map((pool) => (
        <div className="card" key={pool.id}>
          <div className="row">
            <span className={`badge ${pool.status}`}>{pool.status}</span>
            <span className="money">{fmt(pool.totalEarnedPoisha)} earned</span>
          </div>

          <div className="stepper">
            {POOL_STEPS.map((label, i) => {
              const idx = POOL_STEP_INDEX[pool.status] ?? POOL_STEPS.length - 1;
              const cls = i < idx || idx === POOL_STEPS.length - 1 ? 'done' : i === idx ? 'current' : '';
              return (
                <span key={label} className={`step ${cls}`}>
                  <span className="dot" />
                  {label}
                </span>
              );
            })}
          </div>

          <p className="muted" style={{ margin: '10px 0 0' }}>
            {pool.seatsUsed} seat(s) &middot; finished {new Date(pool.finishedAt).toLocaleString()}
          </p>
          {pool.passengers.map((p, i) => (
            <div className="rider" key={i}>
              <span className="avatar sm">{p.name.charAt(0)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row">
                  <strong>{p.name}</strong>
                  <span className="money">{fmt(p.farePoisha)}</span>
                </div>
                <div className="route">
                  {p.from} <span className="arrow">&rarr;</span> {p.to} &middot; {p.seats} seat(s)
                </div>
                <div className="muted" style={{ marginTop: 3 }}>
                  {p.status} &middot; {p.paymentMethod}/{p.paymentStatus}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}
