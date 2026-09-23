'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, setToken, setStoredUser } from '@/lib/api';
import BrandLogo from '@/components/BrandLogo';

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<'PASSENGER' | 'DRIVER'>('PASSENGER');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="page page-narrow">
      <div className="auth-head">
        <BrandLogo height={52} />
        <h1>Create an account</h1>
        <p className="subtitle">Pick your side of the Tesla.</p>
      </div>

      <form className="card auth-card" onSubmit={handleSubmit}>
        <label>I am a</label>
        <div className="role-cards">
          <button
            type="button"
            className={`role-card ${role === 'PASSENGER' ? 'active' : ''}`}
            onClick={() => setRole('PASSENGER')}
          >
            <span className="role-emoji">🙋</span>
            <strong>Passenger</strong>
            <span className="muted">Request rides, split fares</span>
          </button>
          <button
            type="button"
            className={`role-card ${role === 'DRIVER' ? 'active' : ''}`}
            onClick={() => setRole('DRIVER')}
          >
            <span className="role-emoji">🚗</span>
            <strong>Driver</strong>
            <span className="muted">Bring a Tesla, earn per trip</span>
          </button>
        </div>

        <label htmlFor="name">Name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        <label htmlFor="phone">Phone</label>
        <input
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="017XXXXXXXX"
          required
        />
        <label htmlFor="password">Password</label>
        <div className="input-wrap">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="reveal"
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        {role === 'DRIVER' && (
          <div className="appear">
            <hr className="divider" />
            <label htmlFor="teslaName">Tesla name</label>
            <input
              id="teslaName"
              value={teslaName}
              onChange={(e) => setTeslaName(e.target.value)}
              placeholder="e.g. Bullet"
              required
            />
            <label htmlFor="teslaPlate">Plate</label>
            <input
              id="teslaPlate"
              value={teslaPlate}
              onChange={(e) => setTeslaPlate(e.target.value)}
              required
            />
            <label htmlFor="teslaCapacity">Seat capacity</label>
            <div className="segmented">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`seg-btn ${teslaCapacity === n ? 'active' : ''}`}
                  onClick={() => setTeslaCapacity(n)}
                >
                  {n} seat{n > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <div className="error">{error}</div>}
        <button type="submit" className={loading ? 'loading' : ''} disabled={loading}>
          {loading ? 'Creating...' : 'Create account'}
        </button>
      </form>

      <p className="muted" style={{ textAlign: 'center' }}>
        Already have an account?{' '}
        <Link className="link" href="/login">Sign in</Link>
      </p>
    </main>
  );
}
