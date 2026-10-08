// What to tell someone while the list loads, so they know whether to wait or refresh.
export function loadingText(secs: number, attempt: number): string {
  if (attempt > 1) return `That attempt didn't come through. Trying again (attempt ${attempt} of 3), ${secs} s. No need to refresh.`;
  if (secs >= 8) return `Still loading, ${secs} s. Google's server is slow right now. No need to refresh: it keeps trying and will say if something is wrong.`;
  return 'Loading the candidate list. This usually takes 5 to 10 seconds.';
}
