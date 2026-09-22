'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearToken, getStoredUser } from '@/lib/api';

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Top-up failed');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id: string) {
    try {
      await api.cancelRide(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    }
  }

  return (
    <main className="page">
      <div className="top-nav">
        <div>
          <h1>Hi, {user?.name}</h1>
          <p className="subtitle">Where to today?</p>
        </div>
        <button
          className="secondary"
          style={{ width: 'auto', marginTop: 0 }}
          onClick={() => { clearToken(); router.push('/login'); }}
        >
          Sign out
        </button>
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
        <input type="number" min={1} max={3} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />

        <label>Payment</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as 'CASH' | 'TESLAPAY')}
        >
          <option value="CASH">Cash to the driver</option>
          <option value="TESLAPAY">TeslaPay wallet</option>
        </select>

        {estimate && (
          <p className="muted" style={{ marginTop: 12 }}>
            {estimate.distanceKm} km &middot; <strong>{fmt(estimate.solo.totalFarePoisha)}</strong> riding
            alone &middot; {fmt(estimate.pooled.totalFarePoisha)} if someone shares the Tesla
          </p>
        )}

        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Requesting...' : 'Request ride'}</button>
      </form>

      <div className="card">
        <div className="row">
          <span>TeslaPay wallet</span>
          <span>{walletBalancePoisha === null ? '-' : fmt(walletBalancePoisha)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="secondary" style={{ marginTop: 0 }} onClick={() => handleTopUp(10000)}>
            Top up &#2547;100
          </button>
          <button className="secondary" style={{ marginTop: 0 }} onClick={() => handleTopUp(50000)}>
            Top up &#2547;500
          </button>
        </div>
      </div>

      <h2>Your rides</h2>
      {rides.length === 0 && <p className="muted">No rides yet - request one above.</p>}
      {rides.map((r) => (
        <div className="card" key={r.id}>
          <div className="row">
            <span className={`badge ${r.status}`}>{r.status}</span>
            <span>{fmt(r.finalFarePoisha ?? r.estimatedFarePoisha)}</span>
          </div>
          <p className="muted">{r.seats} seat(s) &middot; {new Date(r.createdAt).toLocaleString()}</p>
          {(r.status === 'REQUESTED' || r.status === 'MATCHED' || r.status === 'DRIVER_ARRIVED') && (
            <button className="danger" onClick={() => handleCancel(r.id)}>Cancel</button>
          )}
          <button className="secondary" onClick={() => toggleTrail(r.id)}>
            {openTrailId === r.id ? 'Hide history' : 'What happened on this ride?'}
          </button>
          {openTrailId === r.id && trail && (
            <div style={{ marginTop: 8 }}>
              {trail.payment && (
                <p className="muted">
                  Paid {fmt(trail.payment.amountPoisha)} via {trail.payment.method} ({trail.payment.status})
                </p>
              )}
              {trail.statusHistory.map((h) => (
                <p key={h.id} className="muted">
                  {new Date(h.createdAt).toLocaleTimeString()} &middot;{' '}
                  {h.fromStatus ? `${h.fromStatus} \u2192 ${h.toStatus}` : h.toStatus}
                  {h.note ? ` \u00b7 ${h.note}` : ''}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </main>
  );
}
