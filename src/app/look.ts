// TEMPORARY (look lab): ?look=0..3 picks one of the visual directions being compared.
// The choice is remembered on this device. Removed once a direction is chosen.
const KEY = 'abbss_look';
export function applyLook() {
  let look = '0';
  try {
    const asked = new URLSearchParams(window.location.search).get('look');
    if (asked !== null && /^[0-3]$/.test(asked)) localStorage.setItem(KEY, asked);
    look = localStorage.getItem(KEY) || '0';
  } catch { /* storage blocked: stay on look 0 */ }
  document.documentElement.dataset.look = look;
}

export function setLook(look: string) {
  try { localStorage.setItem(KEY, look); } catch { /* per-device only */ }
  document.documentElement.dataset.look = look;
}
export const currentLook = () => document.documentElement.dataset.look || '0';
