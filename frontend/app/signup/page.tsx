'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken, setStoredUser } from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<'PASSENGER' | 'DRIVER'>('PASSENGER');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [teslaName, setTeslaName] = useState('');
  const [teslaPlate, setTeslaPlate] = useState('');
  const [teslaCapacity, setTeslaCapacity] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = { name, phone, password, role };
      if (role === 'DRIVER') {
        Object.assign(body, { teslaName, teslaPlate, teslaCapacity });
      }
      const { token, user } = await api.signup(body);
      setToken(token);
      setStoredUser(user);
      router.push(role === 'DRIVER' ? '/driver' : '/passenger');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <h1>Create an account</h1>
      <form className="card" onSubmit={handleSubmit}>
        <label>I am a</label>
        <select value={role} onChange={(e) => setRole(e.target.value as 'PASSENGER' | 'DRIVER')}>
          <option value="PASSENGER">Passenger</option>
          <option value="DRIVER">Driver</option>
        </select>
        <label htmlFor="name">Name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        <label htmlFor="phone">Phone</label>
        <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {role === 'DRIVER' && (
          <>
            <label htmlFor="teslaName">Tesla name</label>
            <input id="teslaName" value={teslaName} onChange={(e) => setTeslaName(e.target.value)} placeholder="e.g. Bullet" required />
            <label htmlFor="teslaPlate">Plate</label>
            <input id="teslaPlate" value={teslaPlate} onChange={(e) => setTeslaPlate(e.target.value)} required />
            <label htmlFor="teslaCapacity">Seat capacity</label>
            <input id="teslaCapacity" type="number" min={1} value={teslaCapacity} onChange={(e) => setTeslaCapacity(Number(e.target.value))} required />
          </>
        )}
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
      </form>
    </main>
  );
}
