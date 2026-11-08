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
  if (status === "unsigned") return "Sync off. Not signed in. Logs stay on this phone.";
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

export async function pushSupabase(state, { session, fetch: fetchImpl }) {
  if (!session?.access_token || !session?.user?.id) return { status: "unsigned", state };
  const next = structuredClone(state);
  const outbox = next.sync?.outbox || [];
  for (const item of outbox) {
    if (item.acked) continue;
    if (item.table !== "entry_revisions" && item.table !== "client_snapshots") {
      item.lastError = "Sync failed";
      return { status: "failed", state: next };
    }
    let response;
    try {
      response = await fetchImpl(`${SUPABASE_URL}/rest/v1/${item.table}`, {
        method: "POST",
        redirect: "error",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          authorization: `Bearer ${session.access_token}`,
          "content-type": "application/json",
          prefer: "return=minimal",
        },
        body: JSON.stringify(item.row),
      });
    } catch {
      item.lastError = "Sync failed";
      return { status: "failed", state: next };
    }
    if (!(await accepted(response))) {
      item.lastError = "Sync failed";
      return { status: "failed", state: next };
    }
    item.acked = true;
    item.lastError = null;
  }
  if (next.sync) next.sync.outbox = outbox.filter((item) => !item.acked);
  return { status: next.sync?.outbox?.length ? "pending" : "ready", state: next };
}

async function accepted(response) {
  if (response.ok) return true;
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return response.status === 409 || body.code === "23505";
}
