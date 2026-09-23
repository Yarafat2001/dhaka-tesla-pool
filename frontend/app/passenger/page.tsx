'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { useToasts } from '@/lib/toasts';

interface Zone { id: string; name: string; }
interface Ride {
  id: string;
  status: string;
  seats: number;
  estimatedFarePoisha: number;
  finalFarePoisha: number | null;
  createdAt: string;
}
interface FareBreakdown {
  baseFarePoisha: number;
  distanceChargePoisha: number;
  poolDiscountPoisha: number;
  totalFarePoisha: number;
}
interface Estimate {
  distanceKm: number;
  solo: FareBreakdown;
  pooled: FareBreakdown;
}
interface StatusChange {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
}
interface RideDetail extends Ride {
  payment: { method: string; status: string; amountPoisha: number } | null;
  pickupZone: { name: string };
  dropoffZone: { name: string };
  statusHistory: StatusChange[];
}

function fmt(poisha: number) {
  return `৳${(poisha / 100).toFixed(2)}`;
}

const RIDE_STEPS = ['Requested', 'Matched', 'Driver arrived', 'Started', 'Completed'];
const RIDE_STEP_INDEX: Record<string, number> = {
  REQUESTED: 0,
  MATCHED: 1,
  DRIVER_ARRIVED: 2,
  STARTED: 3,
  COMPLETED: 4,
};


export default function PassengerPage() {
  const router = useRouter();
  const [zones, setZones] = useState<Zone[]>([]);
  const [pickupZoneId, setPickupZoneId] = useState('');
  const [dropoffZoneId, setDropoffZoneId] = useState('');
  const [seats, setSeats] = useState(1);
  const [rides, setRides] = useState<Ride[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TESLAPAY'>('CASH');
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [walletBalancePoisha, setWalletBalancePoisha] = useState<number | null>(null);
  const [openTrailId, setOpenTrailId] = useState<string | null>(null);
  const [trail, setTrail] = useState<RideDetail | null>(null);
  const user = getStoredUser();
  const { push, view: toastsView } = useToasts();

  const refresh = useCallback(async () => {
    const [z, r, w] = await Promise.all([api.zones(), api.myRides(), api.wallet()]);
    setZones(z);
    setRides(r);
    setWalletBalancePoisha(w.walletBalancePoisha);
    if (!pickupZoneId && z.length) setPickupZoneId(z[0].id);
    if (!dropoffZoneId && z.length > 1) setDropoffZoneId(z[1].id);
  }, [pickupZoneId, dropoffZoneId]);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role === 'DRIVER') {
      router.replace('/driver');
      return;
    }
    refresh().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live estimate: Section 3 asks the passenger to "see estimated fare", which
  // is most useful *before* requesting the ride. Shows the solo price and what
  // it would cost if somebody shares the Tesla.
  useEffect(() => {
    if (!pickupZoneId || !dropoffZoneId || pickupZoneId === dropoffZoneId) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    api
      .estimateFare(pickupZoneId, dropoffZoneId)
      .then((e) => {
        if (!cancelled) setEstimate(e);
      })
      .catch(() => {
        if (!cancelled) setEstimate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pickupZoneId, dropoffZoneId]);

  async function handleTopUp(amountPoisha: number) {
    setError(null);
    try {
      const w = await api.topUpWallet(amountPoisha);
      setWalletBalancePoisha(w.walletBalancePoisha);
      push('ok', `Topped up ${fmt(amountPoisha)} - balance ${fmt(w.walletBalancePoisha)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Top-up failed';
      setError(msg);
      push('err', msg);
    }
  }

  async function toggleTrail(rideId: string) {
    if (openTrailId === rideId) {
      setOpenTrailId(null);
      setTrail(null);
      return;
    }
    setError(null);
    try {
      const detail = await api.ride(rideId);
      setTrail(detail);
      setOpenTrailId(rideId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load ride history');
    }
  }

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.requestRide({ pickupZoneId, dropoffZoneId, seats, paymentMethod });
      await refresh();
      push('ok', 'Ride requested - matching you with a Tesla');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setError(msg);
      push('err', msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id: string) {
    try {
      await api.cancelRide(id);
      await refresh();
      push('ok', 'Ride cancelled');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cancel failed';
      setError(msg);
      push('err', msg);
    }
  }

  return (
    <main className="page">
      {toastsView}
      <div className="page-head">
        <div>
          <h1>Hi, {user?.name}</h1>
          <p className="subtitle">Where to today?</p>
        </div>
      </div>

      <form className="card" onSubmit={handleRequest}>
        <label>Pickup zone</label>
        <select value={pickupZoneId} onChange={(e) => setPickupZoneId(e.target.value)}>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        <label>Dropoff zone</label>
        <select value={dropoffZoneId} onChange={(e) => setDropoffZoneId(e.target.value)}>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>

        <label>Seats</label>
        <div className="segmented">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              className={`seg-btn ${seats === n ? 'active' : ''}`}
              onClick={() => setSeats(n)}
            >
              {n} seat{n > 1 ? 's' : ''}
            </button>
          ))}
        </div>

        <label>Payment</label>
        <div className="chips">
          <button
            type="button"
            className={`chip ${paymentMethod === 'CASH' ? 'active' : ''}`}
            onClick={() => setPaymentMethod('CASH')}
          >
            💵 Cash
          </button>
          <button
            type="button"
            className={`chip ${paymentMethod === 'TESLAPAY' ? 'active' : ''}`}
            onClick={() => setPaymentMethod('TESLAPAY')}
          >
            ⚡ TeslaPay wallet
          </button>
        </div>

        {estimate && (
          <div className="estimate">
            <div className="est-row">
              <span className="muted">{estimate.distanceKm} km across Dhaka</span>
              <span className="badge REQUESTED">Estimate</span>
            </div>
            <div className="est-row">
              <span>Riding solo</span>
              <strong>{fmt(estimate.solo.totalFarePoisha)}</strong>
            </div>
            <div className="est-row">
              <span>
                Sharing the Tesla
                <span className="save-pill">
                  save {fmt(estimate.solo.totalFarePoisha - estimate.pooled.totalFarePoisha)}
                </span>
              </span>
              <span className="est-total">{fmt(estimate.pooled.totalFarePoisha)}</span>
            </div>
          </div>
        )}

        {error && <div className="error">{error}</div>}
        <button type="submit" className={loading ? 'loading' : ''} disabled={loading}>
          {loading ? 'Requesting...' : 'Request ride ⚡'}
        </button>
      </form>

      <div className="card">
        <div className="row">
          <div>
            <p className="muted" style={{ margin: 0 }}>TeslaPay wallet</p>
            <span className="wallet-balance">{walletBalancePoisha === null ? '-' : fmt(walletBalancePoisha)}</span>
          </div>
          <span className="avatar">⚡</span>
        </div>
        <div className="btn-row">
          <button className="secondary" onClick={() => handleTopUp(10000)}>Top up ৳100</button>
          <button className="secondary" onClick={() => handleTopUp(50000)}>Top up ৳500</button>
        </div>
      </div>

      <h2>Your rides</h2>
      {rides.length === 0 && (
        <div className="empty">
          <span className="empty-icon">🛺</span>
          No rides yet - request one above and it will show up here.
        </div>
      )}
      {rides.map((r) => (
        <div className="card" key={r.id}>
          <div className="row">
            <span className={`badge ${r.status}`}>{r.status}</span>
            <span className="money">{fmt(r.finalFarePoisha ?? r.estimatedFarePoisha)}</span>
          </div>

          {r.status in RIDE_STEP_INDEX && (
            <div className="stepper">
              {RIDE_STEPS.map((label, i) => {
                const idx = RIDE_STEP_INDEX[r.status];
                const cls = i < idx || idx === RIDE_STEPS.length - 1 ? 'done' : i === idx ? 'current' : '';
                return (
                  <span key={label} className={`step ${cls}`}>
                    <span className="dot" />
                    {label}
                  </span>
                );
              })}
            </div>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <span className="seat-dots" title={`${r.seats} seat(s)`}>
              {Array.from({ length: r.seats }, (_, i) => (
                <span key={i} className="seat-dot filled" />
              ))}
            </span>
            <span className="muted">{r.seats} seat(s) &middot; {new Date(r.createdAt).toLocaleString()}</span>
          </div>

          <div className="btn-row">
            {(r.status === 'REQUESTED' || r.status === 'MATCHED' || r.status === 'DRIVER_ARRIVED') && (
              <button className="danger" onClick={() => handleCancel(r.id)}>Cancel</button>
            )}
            <button className="secondary" onClick={() => toggleTrail(r.id)}>
              {openTrailId === r.id ? 'Hide history' : 'What happened on this ride?'}
            </button>
          </div>

          {openTrailId === r.id && trail && (
            <div className="appear" style={{ marginTop: 12 }}>
              {trail.payment && (
                <p className="muted" style={{ marginTop: 0 }}>
                  Paid {fmt(trail.payment.amountPoisha)} via {trail.payment.method} ({trail.payment.status})
                </p>
              )}
              <div className="timeline">
                {trail.statusHistory.map((h) => (
                  <div key={h.id} className="tl-item">
                    <span className="tl-time">{new Date(h.createdAt).toLocaleTimeString()}</span>
                    {h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus}
                    {h.note ? ` · ${h.note}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </main>
  );
}
