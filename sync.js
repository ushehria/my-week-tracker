// The phone pushes the signed-in user's own rows. It never writes weekly_archives.
// A duplicate client_rev_id (HTTP 409 or Postgres 23505) means that change is already stored.
// Week logs stay on the phone either way. Nothing here is a service-role secret.

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./sync-public.js?v=6";

export const SYNC_CONFIG_KEY = "abdullah-my-week-sync-config";
export const SESSION_KEY = "abdullah-my-week-sync-session";

const BLOCKED_SUFFIXES = ["github.com", "github.io", "githubusercontent.com", "gitlab.com", "bitbucket.org"];

export function readSyncConfig(storage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SYNC_CONFIG_KEY);
    if (!raw) return null;
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function normalizeConfig(config) {
  if (!config || typeof config.endpoint !== "string" || typeof config.token !== "string") return null;
  if (!config.token.trim()) return null;
  let url;
  try {
    url = new URL(config.endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (BLOCKED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return null;
  return { endpoint: url.toString(), token: config.token };
}

export function syncStatusLabel(status) {
  if (status === "unsigned") return "Signed out — tap to sign in again";
  if (status === "failed") return "Sync failed. Logs stay on this phone.";
  if (status === "pending") return "Sync pending. Logs stay on this phone.";
  if (status === "acked") return "Sync finished. Logs stay on this phone.";
  if (status === "ready") return "Sync on. Nothing waiting. Logs stay on this phone.";
  return "Sync off. Logs stay on this phone.";
}

export function currentSyncStatus(state, config) {
  if (!config) return "inactive";
  const pending = (state.outbox || []).filter((item) => !item.acked);
  if (pending.some((item) => item.lastError)) return "failed";
  if (pending.length) return "pending";
  if (Object.values(state.weeks || {}).some((week) => week.archive && week.archive.ack)) return "acked";
  return "ready";
}

export async function attemptSync(state, { storage, fetch: fetchImpl, config, now } = {}) {
  const resolved = config === undefined ? readSyncConfig(storage) : normalizeConfig(config);
  if (!resolved) return { status: "inactive", state };

  const next = structuredClone(state);
  const pending = (next.outbox || []).filter((item) => !item.acked);
  if (!pending.length) return { status: currentSyncStatus(next, resolved), state: next };

  let failed = false;
  for (const item of pending) {
    try {
      const response = await fetchImpl(resolved.endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${resolved.token}`,
          "idempotency-key": item.id,
        },
        body: JSON.stringify(item.payload),
      });
      if (!response.ok) {
        item.lastError = "Sync failed";
        failed = true;
        break;
      }
      const body = await response.json();
      if (!body || body.ack !== true || typeof body.archiveId !== "string" || !body.archiveId) {
        item.lastError = "Sync failed";
        failed = true;
        break;
      }
      const week = next.weeks[item.id];
      if (week) {
        week.archive = {
          ack: true,
          archiveId: body.archiveId,
          ackedAt: (now || new Date()).toISOString(),
        };
      }
      item.acked = true;
      item.archiveId = body.archiveId;
      item.lastError = null;
    } catch {
      item.lastError = "Sync failed";
      failed = true;
      break;
    }
  }

  next.outbox = next.outbox.filter((item) => !item.acked);
  if (failed) return { status: "failed", state: next };
  return { status: "acked", state: next };
}

export function readSession(storage) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(SESSION_KEY) || "null");
    if (!parsed?.access_token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(storage, session) {
  if (!session) storage.removeItem(SESSION_KEY);
  else storage.setItem(SESSION_KEY, JSON.stringify(session));
}

const REFRESH_SKEW_MS = 60_000;

export function sessionExpiryMs(session) {
  const raw = Number(session?.expires_at);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 1e12 ? raw : raw * 1000;
}

export function sessionNeedsRefresh(session, now = Date.now()) {
  if (!session?.refresh_token) return false;
  const expiry = sessionExpiryMs(session);
  if (!expiry) return false;
  return now >= expiry - REFRESH_SKEW_MS;
}

export function describeSync({ session, state, now }) {
  if (!session?.access_token || !session?.user?.id) return "Signed out — tap to sign in again";
  const pending = (state?.sync?.outbox || []).filter((item) => !item.acked).length;
  if (pending > 0) return `${pending} waiting to sync`;
  const syncedAt = Date.parse(state?.sync?.lastSyncedAt || "");
  if (Number.isFinite(syncedAt)) {
    const mins = Math.max(0, Math.round((now - syncedAt) / 60000));
    if (mins < 1) return "Synced just now";
    if (mins === 1) return "Synced 1 min ago";
    return `Synced ${mins} min ago`;
  }
  return "Sync on. Nothing waiting. Logs stay on this phone.";
}

export async function refreshSession(session, fetchImpl) {
  if (!session?.refresh_token) return { ok: false, reason: "signed_out", session: null };
  let response;
  try {
    response = await fetchImpl(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      redirect: "error",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
  } catch {
    return { ok: false, reason: "network", session };
  }
  if (!response.ok) {
    if (response.status >= 500) return { ok: false, reason: "rejected", session };
    return { ok: false, reason: "signed_out", session: null };
  }
  const next = await response.json();
  if (!next?.access_token || !next?.refresh_token || !(next.user?.id || session.user?.id)) {
    return { ok: false, reason: "signed_out", session: null };
  }
  return {
    ok: true,
    session: {
      ...session,
      ...next,
      user: next.user || session.user,
    },
  };
}

export async function ensureFreshSession(session, fetchImpl, now = Date.now()) {
  if (!session?.access_token || !session?.user?.id) return { session: null };
  if (!sessionNeedsRefresh(session, now)) return { session };
  const refreshed = await refreshSession(session, fetchImpl);
  if (!refreshed.ok && refreshed.reason === "network") return { session, offline: true };
  if (!refreshed.ok) return { session: null, signedOut: true };
  return { session: refreshed.session };
}

export function liveSyncStatus(state, session) {
  if (!session?.access_token || !session?.user?.id) return "unsigned";
  const pending = (state.sync?.outbox || []).filter((item) => !item.acked);
  if (pending.some((item) => item.lastError)) return "failed";
  if (pending.length) return "pending";
  return "ready";
}

export function sendFailure(result) {
  if (result?.reason === "rate_limit") {
    const wait = /^\d{1,5}$/.test(String(result.retryAfter || "")) ? ` The response asked for a wait of ${result.retryAfter} seconds.` : " The response did not say how long to wait.";
    return `The email service refused another message for now because its send limit was reached.${wait} Do not request another link yet. You can still build a summary on this phone.`;
  }
  if (result?.reason === "not_authorized") {
    return "This address is not allowed to receive the project's default email. You can still build a summary on this phone.";
  }
  if (result?.reason === "network") return "The request did not finish. Logs stay on this phone. You can still build a summary here.";
  return "The email service did not accept the request. Logs stay on this phone. You can still build a summary here.";
}

export async function requestEmailCode(email, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(`${SUPABASE_URL}/auth/v1/otp`, {
      method: "POST",
      redirect: "error",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, create_user: true }),
    });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (response.ok) return { ok: true, reason: "sent" };
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  const code = `${body.error_code || ""} ${body.error || ""} ${body.msg || ""}`.toLowerCase();
  const retryAfter = response.headers?.get?.("retry-after") || "";
  if (response.status === 429 || code.includes("over_email_send_rate_limit") || code.includes("rate limit")) {
    return { ok: false, reason: "rate_limit", retryAfter: /^\d{1,5}$/.test(String(retryAfter).trim()) ? String(retryAfter).trim() : "" };
  }
  if (code.includes("email_address_not_authorized") || code.includes("not authorized")) {
    return { ok: false, reason: "not_authorized" };
  }
  return { ok: false, reason: "rejected" };
}

const LINK_TYPES = new Set(["email", "magiclink", "signup"]);

export function signInFailure(reason) {
  if (reason === "expired") return "That sign-in link was not accepted. The provider reported it as expired or already used. A mail preview can open the link before you paste it. Logs stay on this phone.";
  if (reason === "network") return "The sign-in request did not finish. Logs stay on this phone.";
  if (reason === "invalid") return "That is not a sign-in link. Paste the full confirmation link. Logs stay on this phone.";
  return "That sign-in link was not accepted. Logs stay on this phone.";
}

export async function verifyMagicLink(link, fetchImpl) {
  let url;
  try {
    url = new URL(String(link || "").trim());
  } catch {
    return { ok: false, reason: "invalid", session: null };
  }
  if (url.protocol !== "https:" || url.hostname !== "psjlltcrepnimnvbggog.supabase.co") {
    return { ok: false, reason: "invalid", session: null };
  }
  if (!url.pathname.endsWith("/auth/v1/verify")) return { ok: false, reason: "invalid", session: null };
  const tokenHash = url.searchParams.get("token");
  const type = url.searchParams.get("type");
  if (!tokenHash || !LINK_TYPES.has(type)) return { ok: false, reason: "invalid", session: null };
  let response;
  try {
    response = await fetchImpl(`${SUPABASE_URL}/auth/v1/verify`, {
      method: "POST",
      redirect: "error",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token_hash: tokenHash, type }),
    });
  } catch {
    return { ok: false, reason: "network", session: null };
  }
  if (!response.ok) {
    let body = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    const code = `${body.error_code || ""} ${body.error || ""} ${body.msg || ""}`.toLowerCase();
    if (response.status === 403 || code.includes("expired") || code.includes("otp_expired")) {
      return { ok: false, reason: "expired", session: null };
    }
    return { ok: false, reason: "rejected", session: null };
  }
  const session = await response.json();
  if (!session?.access_token || !session?.user?.id) return { ok: false, reason: "rejected", session: null };
  return { ok: true, reason: "accepted", session };
}

export async function loadServerRevisions(session, fetchImpl, weeks) {
  const rows = [];
  let offset = 0;
  while (offset < 5000) {
    const url = `${SUPABASE_URL}/rest/v1/entry_revisions?select=week_start,entry_date,field_key,value,client_updated_at,deleted&week_start=in.(${weeks.join(",")})&order=client_updated_at.asc&limit=1000&offset=${offset}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "error",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          authorization: `Bearer ${session.access_token}`,
          accept: "application/json",
        },
      });
    } catch {
      return { ok: false, reason: "network", rows: [] };
    }
    if (response.status === 401) return { ok: false, reason: "unauthorized", rows: [] };
    if (!response.ok) return { ok: false, reason: "failed", rows: [] };
    const page = await response.json();
    if (!Array.isArray(page)) return { ok: false, reason: "failed", rows: [] };
    rows.push(...page);
    if (page.length < 1000) return { ok: true, rows };
    offset += page.length;
  }
  return { ok: true, rows };
}

export async function pushSupabase(state, { session, fetch: fetchImpl, now = Date.now() }) {
  let current = session;
  if (!current?.access_token || !current?.user?.id) return { status: "unsigned", state, session: null };
  if (sessionNeedsRefresh(current, now)) {
    const refreshed = await refreshSession(current, fetchImpl);
    if (!refreshed.ok && refreshed.reason === "network") return { status: "failed", state, session: current };
    if (!refreshed.ok) return { status: "unsigned", signedOut: true, state, session: null };
    current = refreshed.session;
  }
  const next = structuredClone(state);
  const outbox = next.sync?.outbox || [];
  let authRetried = false;
  for (const item of outbox) {
    if (item.acked) continue;
    if (item.table !== "entry_revisions" && item.table !== "client_snapshots") {
      item.lastError = "Sync failed";
      return { status: "failed", state: next, session: current };
    }
    let outcome = await postRow(item, current.access_token, fetchImpl);
    if (outcome.auth && !authRetried && current.refresh_token) {
      authRetried = true;
      const refreshed = await refreshSession(current, fetchImpl);
      if (!refreshed.ok && refreshed.reason === "network") {
        item.lastError = "Sync failed";
        return { status: "failed", state: next, session: current };
      }
      if (!refreshed.ok) return { status: "unsigned", signedOut: true, state: next, session: null };
      current = refreshed.session;
      outcome = await postRow(item, current.access_token, fetchImpl);
    }
    if (outcome.network) {
      item.lastError = "Sync failed";
      return { status: "failed", state: next, session: current };
    }
    if (!outcome.ok) {
      item.lastError = "Sync failed";
      return { status: "failed", state: next, session: current };
    }
    item.acked = true;
    item.lastError = null;
  }
  if (next.sync) next.sync.outbox = outbox.filter((item) => !item.acked);
  return { status: next.sync?.outbox?.length ? "pending" : "ready", state: next, session: current };
}

async function postRow(item, accessToken, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(`${SUPABASE_URL}/rest/v1/${item.table}`, {
      method: "POST",
      redirect: "error",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify(item.row),
    });
  } catch {
    return { ok: false, network: true };
  }
  const body = await readBody(response);
  if (response.ok || response.status === 409 || body.code === "23505") return { ok: true };
  return { ok: false, auth: isAuthFailure(response, body) };
}

function isAuthFailure(response, body) {
  if (response.status === 401) return true;
  const text = `${body.error_code || ""} ${body.error || ""} ${body.msg || ""} ${body.message || ""}`.toLowerCase();
  return text.includes("jwt") && (text.includes("expired") || text.includes("invalid"));
}

async function readBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
