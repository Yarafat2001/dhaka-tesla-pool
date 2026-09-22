const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('token');
}

export function setToken(token: string) {
  window.localStorage.setItem('token', token);
}

export function clearToken() {
  window.localStorage.removeItem('token');
}

export function getStoredUser(): { id: string; name: string; role: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export function setStoredUser(user: { id: string; name: string; role: string }) {
  window.localStorage.setItem('user', JSON.stringify(user));
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  signup: (body: unknown) => request('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: unknown) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  zones: () => request('/api/zones'),
  requestRide: (body: unknown) => request('/api/rides', { method: 'POST', body: JSON.stringify(body) }),
  myRides: () => request('/api/rides/mine'),
  cancelRide: (id: string) => request(`/api/rides/${id}/cancel`, { method: 'POST' }),
  setOnline: (isOnline: boolean) =>
    request('/api/driver/online', { method: 'POST', body: JSON.stringify({ isOnline }) }),
  myTesla: () => request('/api/driver/me'),
  driverHistory: () => request('/api/driver/history'),
  accept: (poolId: string) => request(`/api/driver/pools/${poolId}/accept`, { method: 'POST' }),
  wallet: () => request('/api/wallet'),
  topUpWallet: (amountPoisha: number) =>
    request('/api/wallet/topup', { method: 'POST', body: JSON.stringify({ amountPoisha }) }),
  ride: (id: string) => request(`/api/rides/${id}`),
  estimateFare: (pickupZoneId: string, dropoffZoneId: string) =>
    request('/api/rides/estimate', {
      method: 'POST',
      body: JSON.stringify({ pickupZoneId, dropoffZoneId }),
    }),
  arrive: (poolId: string) => request(`/api/driver/pools/${poolId}/arrive`, { method: 'POST' }),
  start: (poolId: string) => request(`/api/driver/pools/${poolId}/start`, { method: 'POST' }),
  complete: (poolId: string) => request(`/api/driver/pools/${poolId}/complete`, { method: 'POST' }),
};
