// One transport to the backend. Every staff call is a POST, sent as text/plain
// so the browser skips the CORS preflight Apps Script can't answer. There is
// no login (see auth.tsx), so no token goes with it.

import { savedCopyTime } from './freshness';

export const API_URL: string = (import.meta.env.VITE_API_URL || '').trim();

// The production backend. Only the live site may talk to it: a local dev server or a
// Vercel preview of some branch must never touch live data, whatever its settings say.
// The original production project and production 2 (the fresh copy serving the app since 2026-10-08).
const PROD_API_URLS = [
  'https://script.google.com/macros/s/AKfycbzuMsCMlqGhFBBSLpWGBMT0jkfHATvi9WJCKDm_KUdIaocK8N3TdM7hbaXeJjl-uj6F/exec',
  'https://script.google.com/macros/s/AKfycbxYQJxWkw1AO_h2fmh4JoGnO3VOt1yQEQh4tMDIwiaBppUuejvHG-SBKd_swGKg0IPE/exec',
];
const LIVE_HOSTS = ['abbss-hiring-pipeline.vercel.app'];

// True when this page (by hostname) must not use this backend address.
export function isBackendBlocked(apiUrl: string, hostname: string): boolean {
  if (!PROD_API_URLS.includes(apiUrl)) return false;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname);
  const preview = /\.vercel\.app$/.test(hostname) && !LIVE_HOSTS.includes(hostname);
  return local || preview;
}
export const API_BLOCKED = typeof location !== 'undefined' && isBackendBlocked(API_URL, location.hostname);

export class ApiError extends Error {
  readonly network: boolean;
  readonly timeout: boolean;
  constructor(message: string, opts: { network?: boolean; timeout?: boolean } = {}) {
    super(message);
    this.network = !!opts.network;
    this.timeout = !!opts.timeout;
  }
}

// A request that never answers must not spin forever. Reads (getAll and friends) give up
// after 30 s. A save may still have gone through, so it is given longer and says so.
export const READ_TIMEOUT_MS = 30_000;
export const WRITE_TIMEOUT_MS = 90_000;
// Google sometimes holds a reply for 30 to 60 s while the next identical request answers in
// 3 to 5 s. So a read that hasn't answered sends another copy at these moments; the first
// good answer wins and the rest are cancelled. Reads change nothing, so copies are harmless.
export const READ_COPY_AT_MS = [0, 6_000, 14_000];
const isRead = (action: string) => /^get[A-Z]/.test(action);

// Apps Script parks each reply on a second Google address. When that hop fails, the browser is
// sent back to the main address without the request and the backend answers this.
export const BOUNCED_REPLY = 'Unknown: undefined';
const lostReply = (read: boolean) => (read
  ? "Google's server didn't pass the reply on."
  : "Google's server didn't pass the reply on, so the save couldn't be confirmed.");

function checkSendable(action: string) {
  if (!API_URL) throw new ApiError('The backend address is not set (VITE_API_URL).');
  if (API_BLOCKED) throw new ApiError('This copy of the app (local or a preview) cannot use the production backend. Point VITE_API_URL at staging.');
  if (!isRead(action) && savedCopyTime()) throw new ApiError('Waiting for the latest data. Try again in a moment.');
}

// One request. A Google error page or a bounced reply is a lost reply (network), not an answer.
async function once(action: string, params: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> {
  const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...params }), signal });
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError(`${lostReply(isRead(action))} (HTTP ${res.status}: ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)})`, { network: true });
  }
  if (json.success === false && json.error === BOUNCED_REPLY) throw new ApiError(lostReply(isRead(action)), { network: true });
  return json;
}

const asNetworkError = (e: unknown) => (e instanceof ApiError ? e : new ApiError(`Could not reach the backend (${(e as Error)?.message || 'network error'}).`, { network: true }));

// A save: one request, never repeated by the app (it may have gone through).
async function sendWrite(action: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, WRITE_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    return await once(action, params, ctrl.signal);
  } catch (e) {
    if (timedOut) throw new ApiError(`The server didn't answer in ${WRITE_TIMEOUT_MS / 1000} seconds. The change may have been saved: reload and check before trying again.`, { network: true, timeout: true });
    if (signal?.aborted) throw e;
    throw asNetworkError(e);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// A read: up to three copies, staggered (READ_COPY_AT_MS); the first good answer wins.
function sendRead(action: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const copies: AbortController[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let pending = 0;
    let done = false;
    let lastError: unknown;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      copies.forEach((c) => c.abort());
      signal?.removeEventListener('abort', onAbort);
      settle();
    };
    const launch = () => {
      if (done || copies.length >= READ_COPY_AT_MS.length) return;
      const c = new AbortController();
      copies.push(c);
      pending++;
      once(action, params, c.signal).then(
        (json) => finish(() => resolve(json)),
        (e) => {
          if (done) return;
          pending--;
          lastError = e;
          // This copy failed outright: start the next one now instead of waiting.
          if (copies.length < READ_COPY_AT_MS.length) launch();
          else if (pending === 0) finish(() => reject(asNetworkError(lastError)));
        },
      );
    };
    const onAbort = () => finish(() => reject(new DOMException('The operation was aborted.', 'AbortError')));
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort);
    READ_COPY_AT_MS.forEach((at) => { if (at === 0) launch(); else timers.push(setTimeout(launch, at)); });
    timers.push(setTimeout(() => finish(() => reject(new ApiError(`The server didn't answer in ${READ_TIMEOUT_MS / 1000} seconds. Try again.`, { network: true, timeout: true }))), READ_TIMEOUT_MS));
  });
}

export async function call<T = Record<string, unknown>>(action: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  checkSendable(action);
  const json = await (isRead(action) ? sendRead(action, params, signal) : sendWrite(action, params, signal));
  if (json.success === false) throw new ApiError(String(json.error || `${action} failed.`));
  return json as T;
}
