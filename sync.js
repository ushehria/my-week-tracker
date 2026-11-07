// Sync is inactive until a private HTTPS endpoint and bearer token are set
// on this device. Nothing in the repo is an endpoint, token, or archive.
// The device deletes a pending payload only after the response is
// { ack: true, archiveId: "..." }. Week logs stay on the device either way.

export const SYNC_CONFIG_KEY = "abdullah-my-week-sync-config";

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
