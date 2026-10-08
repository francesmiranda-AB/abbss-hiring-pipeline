import { useEffect, useState } from 'react';

// True once `active` has stayed true for `ms`. Used to say "still loading" instead of
// letting a slow server look like a frozen app.
export function useSlow(active: boolean, ms: number): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setSlow(true), ms);
    return () => { clearTimeout(t); setSlow(false); };
  }, [active, ms]);
  return slow;
}

// Whole seconds since `active` turned true (0 while it is false), for "Still loading, 12 s".
export function useElapsed(active: boolean): number {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t0 = Date.now();
    const iv = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => { clearInterval(iv); setSecs(0); };
  }, [active]);
  return secs;
}
