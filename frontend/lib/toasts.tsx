'use client';
import { useCallback, useState } from 'react';

export interface Toast {
  id: number;
  kind: 'ok' | 'err';
  text: string;
}

// Lightweight presentational toast queue. Actions like "request ride" or
// "go online" used to succeed silently - this gives the user visible
// confirmation without touching any API/data logic. Auto-dismisses.
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const view = (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="toast-ico">{t.kind === 'ok' ? '✓' : '⚠'}</span>
          {t.text}
        </div>
      ))}
    </div>
  );

  return { push, view };
}
