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
  const user = getStoredUser();

  const refresh = useCallback(async () => {
    const [z, r] = await Promise.all([api.zones(), api.myRides()]);
    setZones(z);
    setRides(r);
    if (!pickupZoneId && z.length) setPickupZoneId(z[0].id);
    if (!dropoffZoneId && z.length > 1) setDropoffZoneId(z[1].id);
  }, [pickupZoneId, dropoffZoneId]);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    refresh().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.requestRide({ pickupZoneId, dropoffZoneId, seats });
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
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Requesting...' : 'Request ride'}</button>
      </form>

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
        </div>
      ))}
    </main>
  );
}
