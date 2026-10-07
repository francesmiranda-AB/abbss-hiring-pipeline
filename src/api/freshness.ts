// Whether the list on screen is the copy saved on this device from an earlier visit,
// rather than what the server said during this visit. While it is, nothing is saved
// (client.ts refuses writes) so nobody acts on old data.
let savedAt = 0; // 0 = showing live data
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export function showingSavedCopy(at: number) {
  savedAt = at;
  notify();
}
export function markFresh() {
  if (!savedAt) return;
  savedAt = 0;
  notify();
}
export const savedCopyTime = () => savedAt;
export function subscribeSavedCopy(f: () => void) {
  subs.add(f);
  return () => { subs.delete(f); };
}
