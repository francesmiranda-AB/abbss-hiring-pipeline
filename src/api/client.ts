// One transport to the backend. Every staff call is a POST, sent as text/plain
// so the browser skips the CORS preflight Apps Script can't answer. There is
// no login (see auth.tsx), so no token goes with it.

import { savedCopyTime } from './freshness';

export const API_URL: string = (import.meta.env.VITE_API_URL || '').trim();

// The production backend. Only the live site may talk to it: a local dev server or a
// Vercel preview of some branch must never touch live data, whatever its settings say.
const PROD_API_URL = 'https://script.google.com/macros/s/AKfycbzuMsCMlqGhFBBSLpWGBMT0jkfHATvi9WJCKDm_KUdIaocK8N3TdM7hbaXeJjl-uj6F/exec';
const LIVE_HOSTS = ['abbss-hiring-pipeline.vercel.app'];

// True when this page (by hostname) must not use this backend address.
export function isBackendBlocked(apiUrl: string, hostname: string): boolean {
  if (apiUrl !== PROD_API_URL) return false;
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
const isRead = (action: string) => /^get[A-Z]/.test(action);

async function send(action: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (!API_URL) throw new ApiError('The backend address is not set (VITE_API_URL).');
  if (API_BLOCKED) throw new ApiError('This copy of the app (local or a preview) cannot use the production backend. Point VITE_API_URL at staging.');
  const read = isRead(action);
  if (!read && savedCopyTime()) throw new ApiError('Waiting for the latest data. Try again in a moment.');
  const ms = read ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, ms);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  let res: Response;
  let text: string;
  try {
    res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...params }), signal: ctrl.signal });
    text = await res.text();
  } catch (e) {
    if (timedOut) {
      const secs = ms / 1000;
      throw new ApiError(read ? `The server didn't answer in ${secs} seconds. Try again.` : `The server didn't answer in ${secs} seconds. The change may have been saved: reload and check before trying again.`, { network: true, timeout: true });
    }
    if (signal?.aborted) throw e; // the caller cancelled it (a newer request replaced it)
    throw new ApiError(`Could not reach the backend (${(e as Error).message || 'network error'}).`, { network: true });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError(`The backend answered with something that isn't data (HTTP ${res.status}): ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160)}`);
  }
  return json;
}

export async function call<T = Record<string, unknown>>(action: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const json = await send(action, params, signal);
  if (json.success === false) throw new ApiError(String(json.error || `${action} failed.`));
  return json as T;
}
