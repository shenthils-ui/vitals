// The single module that decides where API calls go: the in-browser sql.js
// engine (standalone build) or fetch() to the Express RPC (server build).
// import.meta.env.VITE_STANDALONE is statically defined in vite.config.js, so
// the unused branch is tree-shaken — no wasm ever ships in the server build.

export const BASE = import.meta.env.BASE_URL;

export class ServerUnreachableError extends Error {
  constructor() { super('Cannot reach the Vitals server'); this.unreachable = true; }
}

export async function rpc(method, args = {}) {
  if (import.meta.env.VITE_STANDALONE) {
    const { localCall } = await import('../engine/local.js');
    return localCall(method, args);
  } else {
    let res;
    try {
      res = await fetch(`${BASE}api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, args }),
      });
    } catch {
      throw new ServerUnreachableError();
    }
    let data;
    try { data = await res.json(); } catch { throw new ServerUnreachableError(); }
    if (!data.ok) throw new Error(data.error || `Server error (${res.status})`);
    return data.result;
  }
}

export const IS_STANDALONE = !!import.meta.env.VITE_STANDALONE;

// Exposed for the automated verification scripts (scripts/verify.mjs).
if (typeof window !== 'undefined') window.__vitalsRpc = rpc;
