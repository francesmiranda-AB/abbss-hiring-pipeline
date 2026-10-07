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
