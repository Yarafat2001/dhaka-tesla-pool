'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, setToken, setStoredUser } from '@/lib/api';

// The seeded cast from the story - tapping a chip fills the form so the demo
// (and the evaluator) never has to type a phone number by hand.
const DEMO = [
  { name: 'Jashim', phone: '01710000001', sub: 'Driver · 01710000001', initial: '🚗' },
  { name: 'Nusrat', phone: '01710000002', sub: 'Passenger · 01710000002', initial: 'N' },
  { name: 'Rafiq', phone: '01710000003', sub: 'Passenger · 01710000003', initial: 'R' },
  { name: 'Shirin', phone: '01710000004', sub: 'Passenger · 01710000004', initial: 'S' },
];

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('01710000002');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await api.login({ phone, password });
      setToken(token);
      setStoredUser(user);
      router.push(user.role === 'DRIVER' ? '/driver' : '/passenger');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="brand">
        <div className="logo">⚡</div>
        <div>
          <h1>Dhaka Tesla Pool</h1>
          <p>Share a seat. Split the fare. Survive Dhaka traffic.</p>
        </div>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <label>Quick fill the demo cast</label>
        <div className="chips">
          {DEMO.map((d) => (
            <button
              key={d.phone}
              type="button"
              className={`chip ${phone === d.phone ? 'active' : ''}`}
              onClick={() => {
                setPhone(d.phone);
                setPassword('password123');
                setError(null);
              }}
            >
              <span className="avatar sm">{d.initial}</span>
              {d.name}
              <span className="chip-sub">{d.sub}</span>
            </button>
          ))}
        </div>

        <hr className="divider" />

        <label htmlFor="phone">Phone</label>
        <input
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
        />

        <label htmlFor="password">Password</label>
        <div className="input-wrap">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            className="reveal"
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        {error && <div className="error">{error}</div>}
        <button type="submit" className={loading ? 'loading' : ''} disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="muted" style={{ textAlign: 'center' }}>
        Every demo account uses the password <strong>password123</strong>.
      </p>
      <p style={{ textAlign: 'center' }}>
        <Link className="link" href="/signup">New here? Create an account</Link>
      </p>
    </main>
  );
}
