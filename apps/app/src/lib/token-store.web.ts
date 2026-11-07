// Web: session storage, so the token ends with the browser tab. Local mock tokens only (ADR-030).
const KEY = "fp.session.token";
const store = () => { try { return globalThis.sessionStorage; } catch { return undefined; } };
export const tokenStore = {
  get: async () => store()?.getItem(KEY) ?? null,
  set: async (v: string) => { store()?.setItem(KEY, v); },
  clear: async () => { store()?.removeItem(KEY); },
};
