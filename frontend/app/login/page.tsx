'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, setToken, setStoredUser } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('01710000002');
  const [password, setPassword] = useState('password123');
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
      <h1>Dhaka Tesla Pool</h1>
      <p className="subtitle">Sign in to continue</p>
      <form className="card" onSubmit={handleSubmit}>
        <label htmlFor="phone">Phone</label>
        <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
      </form>
      <p className="muted">
        Demo accounts (password: password123): Jashim (driver, 01710000001),
        Nusrat (01710000002), Rafiq (01710000003), Shirin (01710000004).
      </p>
      <Link className="link" href="/signup">New here? Create an account</Link>
    </main>
  );
}
