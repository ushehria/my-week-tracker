import { PLAN } from "./plan.js";
import { LEGACY_PLAN } from "./legacy-plan.js";
import { bindAutoDate, createViewController } from "./view-date.js";
import { pageModel } from "./page-model.js";
import { renderDayNav, renderMain, renderSync } from "./render.js";
import {
  addActivity,
  clearDay,
  loadState,
  removeActivity,
  saveState,
  sealDueWeeks,
  setDayValue,
  setMark,
  setWeekNote,
  updateActivity,
} from "./store.js";
import { attemptSync, currentSyncStatus, readSyncConfig } from "./sync.js";

export function startApp(doc, options = {}) {
  const view = doc.defaultView;
  const storage = options.storage || view.localStorage;
  const now = options.now || (() => new Date());
  const schedule = options.schedule || ((delay, fn) => view.setTimeout(fn, delay));
  const fetchImpl = options.fetch || view.fetch.bind(view);

  let state = loadState(storage, { legacyPlan: LEGACY_PLAN });
  const sealed = sealDueWeeks(state, now(), PLAN);
  if (JSON.stringify(sealed) !== JSON.stringify(state)) saveState(storage, sealed);
  state = sealed;

  const controller = createViewController({ now });
  let summaryOpen = false;
  let revision = 0;
  let flushing = false;
  let flushAgain = false;

  const title = doc.getElementById("title");
  const sub = doc.getElementById("sub");
  const sync = doc.getElementById("sync");
  const dayTop = doc.getElementById("dayTop");
  const dayBottom = doc.getElementById("dayBottom");
  const app = doc.getElementById("app");
  const saved = doc.getElementById("savedMsg");

  function status() {
    return currentSyncStatus(state, readSyncConfig(storage));
  }

  function model() {
    return pageModel({
      plan: PLAN,
      state,
      selectedDate: controller.selectedDate(),
      now: now(),
      syncStatus: status(),
    });
  }

  function touchSaved() {
    const stamp = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
    }).format(now());
    saved.textContent = `Saved on this phone · ${stamp}`;
  }

  function commit(next) {
    revision += 1;
    state = next;
    saveState(storage, state);
    touchSaved();
  }

  function draw() {
    const y = view.scrollY || 0;
    const current = model();
    doc.title = `${current.title} · ${current.range}`;
    title.textContent = `${current.title} · ${current.range}`;
    sub.textContent = current.viewingHint ? `${current.range} · ${current.viewingHint}` : "Tap · → ✓ → ✗. Saves on this phone.";
    sync.innerHTML = renderSync(current);
    dayTop.innerHTML = renderDayNav(current);
    dayBottom.innerHTML = renderDayNav(current);
    app.innerHTML = renderMain(current);
    if (summaryOpen) showSummary(current);
    view.scrollTo(0, y);
  }

  function showSummary(current) {
    const box = doc.getElementById("summaryBox");
    const copy = doc.getElementById("copy-summary");
    if (!box || !copy) return;
    box.hidden = false;
    copy.hidden = false;
    box.textContent = summaryText(current);
  }

  doc.body.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const current = model();
    if (button.dataset.date) {
      controller.selectManually(button.dataset.date);
      summaryOpen = false;
      draw();
      view.scrollTo(0, 0);
      return;
    }
    if (button.dataset.habit) {
      const item = current.view.bands.flatMap((band) => band.items).find((entry) => entry.id === button.dataset.habit);
      commit(setMark(state, current.selectedDate, button.dataset.habit, cycleMark(item?.mark || "")));
      draw();
      return;
    }
    if (button.id === "add-activity") {
      const id = view.crypto?.randomUUID?.() || `window-${Date.now()}`;
      commit(addActivity(state, current.selectedDate, { id }));
      draw();
      doc.querySelector(`[data-activity="${id}"]`)?.scrollIntoView({ block: "center" });
      return;
    }
    if (button.dataset.removeActivity) {
      commit(removeActivity(state, current.selectedDate, button.dataset.removeActivity));
      draw();
      return;
    }
    if (button.id === "clear-day") {
      commit(clearDay(state, current.selectedDate));
      draw();
      return;
    }
    if (button.id === "build-summary") {
      summaryOpen = true;
      showSummary(current);
      return;
    }
    if (button.id === "copy-summary") copySummary(button);
  });

  doc.body.addEventListener("input", (event) => {
    const target = event.target;
    const current = model();
    if (target.id === "cigs" || target.id === "energy") {
      commit(setDayValue(state, current.selectedDate, target.id, target.value));
      return;
    }
    if (target.id === "note") {
      commit(setWeekNote(state, current.selectedDate, target.value));
      return;
    }
    const field = target.getAttribute?.("data-field");
    const card = target.closest?.("[data-activity]");
    if (field && card) {
      commit(updateActivity(state, current.selectedDate, card.getAttribute("data-activity"), {
        [field]: target.value,
      }));
    }
  });

  function copySummary(button) {
    const text = summaryText(model());
    const done = () => {
      button.textContent = "Copied";
      view.setTimeout(() => {
        button.textContent = "Copy summary";
      }, 1200);
    };
    const clipboard = view.navigator?.clipboard;
    if (!clipboard?.writeText) {
      button.textContent = "Select the summary";
      return;
    }
    clipboard.writeText(text).then(done).catch(() => {
      button.textContent = "Select the summary";
    });
  }

  bindAutoDate(controller, doc, {
    now,
    schedule,
    onChange() {
      summaryOpen = false;
      draw();
    },
  });

  draw();
  void flushSync();

  if (view.navigator?.serviceWorker) {
    view.navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  async function flushSync() {
    if (flushing) {
      flushAgain = true;
      return;
    }
    flushing = true;
    try {
      do {
        flushAgain = false;
        const seen = revision;
        const snapshot = state;
        const result = await attemptSync(snapshot, { storage, fetch: fetchImpl, now: now() });
        if (seen !== revision) {
          flushAgain = true;
          continue;
        }
        if (result.status === "inactive") continue;
        state = result.state;
        saveState(storage, state);
        draw();
      } while (flushAgain);
    } finally {
      flushing = false;
    }
  }
}

function cycleMark(current) {
  if (current === "yes") return "no";
  if (current === "no") return "";
  return "yes";
}

function summaryText(current) {
  const lines = [current.heading];
  if (current.view.banner) lines.push(current.view.banner);
  for (const band of current.view.bands) {
    for (const item of band.items) {
      const mark = item.mark === "yes" ? "✓" : item.mark === "no" ? "✗" : "—";
      const detail = [item.time, item.note].filter(Boolean).join(" · ");
      lines.push(`${item.label}${detail ? ` (${detail})` : ""}: ${mark}`);
    }
  }
  if (current.view.activities) {
    if (!current.view.activities.items.length) lines.push("Windows: —");
    for (const item of current.view.activities.items) {
      const range = [item.start, item.end].filter(Boolean).join("–");
      const parts = [range, item.place, item.duration].filter(Boolean);
      lines.push(parts.join(" · ") || "Window");
    }
  }
  lines.push(`Cigarettes: ${current.cigs || "—"}`);
  lines.push(`Energy 1–10: ${current.energy || "—"}`);
  if (current.note.trim()) lines.push(`Note: ${current.note.trim()}`);
  return lines.join("\n");
}

startApp(document);
