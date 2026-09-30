// One transport to the backend. Every staff call is a POST with the signed-in
// person's ID token in the body (never in a URL). The body is sent as
// text/plain so the browser skips the CORS preflight Apps Script can't answer.

export const API_URL: string = (import.meta.env.VITE_API_URL || '').trim();

// The production backend. A local dev server must never talk to it.
const PROD_API_URL = 'https://script.google.com/macros/s/AKfycbzuMsCMlqGhFBBSLpWGBMT0jkfHATvi9WJCKDm_KUdIaocK8N3TdM7hbaXeJjl-uj6F/exec';
const IS_LOCAL = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const API_BLOCKED = IS_LOCAL && API_URL === PROD_API_URL;

export class ApiError extends Error {
  readonly auth: boolean;
  readonly network: boolean;
  constructor(message: string, opts: { auth?: boolean; network?: boolean } = {}) {
    super(message);
    this.auth = !!opts.auth;
    this.network = !!opts.network;
  }
}

type TokenSource = { getToken: () => Promise<string>; refreshToken: () => Promise<string> };
let tokens: TokenSource = { getToken: async () => '', refreshToken: async () => '' };
export function setTokenSource(src: TokenSource) {
  tokens = src;
}

async function send(action: string, params: Record<string, unknown>, idToken: string): Promise<Record<string, unknown>> {
  if (!API_URL) throw new ApiError('The backend address is not set (VITE_API_URL).');
  if (API_BLOCKED) throw new ApiError('A local copy of the app cannot use the production backend. Point VITE_API_URL at staging.');
  let res: Response;
  try {
    res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...params, idToken }) });
  } catch (e) {
    throw new ApiError(`Could not reach the backend (${(e as Error).message || 'network error'}).`, { network: true });
  }
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError(`The backend answered with something that isn't data (HTTP ${res.status}): ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160)}`);
  }
  if (json.authError) throw new ApiError(String(json.error || 'Sign in again to continue.'), { auth: true });
  return json;
}

// Calls an action. An expired sign-in is refreshed once, silently.
export async function call<T = Record<string, unknown>>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  let json: Record<string, unknown>;
  try {
    json = await send(action, params, await tokens.getToken());
  } catch (e) {
    if (!(e instanceof ApiError && e.auth)) throw e;
    json = await send(action, params, await tokens.refreshToken());
  }
  if (json.success === false) throw new ApiError(String(json.error || `${action} failed.`));
  return json as T;
}
