import { PLAN } from "./plan.js";
import { LEGACY_PLAN } from "./legacy-plan.js";
import { bindAutoDate, createViewController } from "./view-date.js";
import { pageModel } from "./page-model.js";
import { renderDayNav, renderMain, renderSync } from "./render.js";
import {
  clearDay,
  loadState,
  removeActivity,
  saveFlexibleActivity,
  saveState,
  sealDueWeeks,
  setCall,
  setDayValue,
  setMark,
  setWeekNote,
  shouldAskCall,
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
  let activityError = "";
  let promptParent = null;
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
    current.activityError = activityError;
    current.promptParent = promptParent;
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
      const item = findHabit(current.view, button.dataset.habit);
      commit(setMark(state, current.selectedDate, button.dataset.habit, cycleMark(item?.mark || "")));
      draw();
      return;
    }
    if (button.id === "add-activity") {
      const result = saveFlexibleActivity(state, current.selectedDate, {
        id: view.crypto?.randomUUID?.() || `activity-${Date.now()}`,
        title: doc.getElementById("activity-title")?.value || "",
        start: doc.getElementById("activity-start")?.value || "",
        end: doc.getElementById("activity-end")?.value || "",
      });
      if (!result.ok) {
        activityError = result.error;
        draw();
        return;
      }
      activityError = "";
      commit(result.state);
      draw();
      return;
    }
    if (button.id === "call-save" && promptParent) {
      const note = doc.getElementById("call-response")?.value || "";
      commit(setCall(state, current.selectedDate, promptParent, { done: true, note }));
      promptParent = null;
      draw();
      return;
    }
    if (button.id === "call-skip") {
      promptParent = null;
      draw();
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
    const card = target.closest?.("[data-activity]");
    if (card && card.id !== "new-activity") {
      const activityId = card.getAttribute("data-activity");
      const result = saveFlexibleActivity(state, current.selectedDate, {
        id: activityId,
        title: card.querySelector('[data-field="title"]')?.value || "",
        start: card.querySelector('[data-field="start"]')?.value || "",
        end: card.querySelector('[data-field="end"]')?.value || "",
      });
      if (!result.ok) {
        activityError = result.error;
        draw();
        return;
      }
      activityError = "";
      commit(result.state);
      draw();
    }
  });

  doc.body.addEventListener("change", (event) => {
    const target = event.target;
    if (target.id !== "call-mother" && target.id !== "call-father") return;
    const parent = target.id === "call-mother" ? "mother" : "father";
    const current = model();
    const previous = current.calls[parent];
    const done = Boolean(target.checked);
    commit(setCall(state, current.selectedDate, parent, { done }));
    if (shouldAskCall(previous.done, done)) promptParent = parent;
    else if (promptParent === parent) promptParent = null;
    draw();
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

function findHabit(view, id) {
  const pools = [
    ...(view.bands || []).flatMap((band) => band.items),
    ...(view.prayers || []),
    ...(view.checkins || []),
    ...(view.preserved || []),
  ];
  return pools.find((item) => item.id === id);
}

function cycleMark(current) {
  if (current === "yes") return "no";
  if (current === "no") return "";
  return "yes";
}

function summaryText(current) {
  const lines = [current.heading];
  if (current.view.banner) lines.push(current.view.banner);
  for (const item of [...(current.view.prayers || []), ...(current.view.checkins || []), ...(current.view.preserved || [])]) {
    const mark = item.mark === "yes" ? "✓" : item.mark === "no" ? "✗" : "—";
    lines.push(`${item.label}${item.time ? ` (${item.time})` : ""}: ${mark}`);
  }
  for (const band of current.view.bands || []) {
    for (const item of band.items) {
      if (item.kind === "window") {
        const range = [item.start, item.end].filter(Boolean).join("–");
        const detail = [item.time, range, item.place, item.duration].filter(Boolean).join(" · ");
        lines.push(`${item.label}${detail ? `: ${detail}` : ""}`);
        continue;
      }
      const mark = item.mark === "yes" ? "✓" : item.mark === "no" ? "✗" : "—";
      const detail = [item.time, item.note].filter(Boolean).join(" · ");
      lines.push(`${item.label}${detail ? ` (${detail})` : ""}: ${mark}`);
    }
  }
  if (current.view.activities) {
    for (const item of current.view.activities.items) {
      const range = [item.start, item.end].filter(Boolean).join("–");
      const parts = [item.title, range, item.duration].filter(Boolean);
      if (parts.length) lines.push(parts.join(" · "));
    }
  }
  if (current.calls?.mother?.done) lines.push(`Call mother: ✓${current.calls.mother.note ? ` (${current.calls.mother.note})` : ""}`);
  if (current.calls?.father?.done) lines.push(`Call father: ✓${current.calls.father.note ? ` (${current.calls.father.note})` : ""}`);
  lines.push(`Cigarettes: ${current.cigs || "—"}`);
  lines.push(`Energy 1–10: ${current.energy || "—"}`);
  if (current.note.trim()) lines.push(`Note: ${current.note.trim()}`);
  return lines.join("\n");
}

startApp(document);
