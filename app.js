import { PLAN } from "./plan.js?v=9";
import { LEGACY_PLAN } from "./legacy-plan.js?v=9";
import { SYNC_OWNER_EMAIL } from "./sync-public.js?v=9";
import { queueBootstrap, queueChanges } from "./sync-queue.js?v=9";
import { weekSummary } from "./week-summary.js?v=9";
import { addCalendarDays, weekDates } from "./london-time.js?v=9";
import { bindAutoDate, createViewController } from "./view-date.js?v=9";
import { pageModel } from "./page-model.js?v=9";
import { renderDayNav, renderMain, renderSync, renderWeekNav } from "./render.js?v=9";
import {
  addActivity,
  adjustCigs,
  clearDay,
  LEGACY_STORE_KEY,
  loadState,
  removeActivity,
  saveFlexibleActivity,
  saveState,
  sealDueWeeks,
  setCall,
  setDayNote,
  setDayValue,
  recordWindowEdit,
  setMark,
  setWeekNote,
  shouldAskCall,
} from "./store.js?v=9";
import {
  liveSyncStatus,
  pushSupabase,
  readSession,
  requestEmailCode,
  sendFailure,
  signInFailure,
  verifyMagicLink,
  writeSession,
} from "./sync.js?v=9";

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
  let syncMessage = "";
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

  function model() {
    const session = readSession(storage);
    const current = pageModel({
      plan: PLAN,
      state,
      selectedDate: controller.selectedDate(),
      weekStart: controller.weekStart(),
      now: now(),
      syncStatus: session ? liveSyncStatus(state, session) : "unsigned",
    });
    current.showSignIn = !session;
    current.syncEmail = SYNC_OWNER_EMAIL;
    current.syncMessage = syncMessage;
    return current;
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
    next = queueChanges(next, now().toISOString());
    revision += 1;
    state = next;
    saveState(storage, state);
    touchSaved();
    void flushSync();
  }

  function draw() {
    const y = view.scrollY || 0;
    const current = model();
    doc.title = `${current.title} · ${current.range}`;
    title.textContent = `${current.title} · ${current.range}`;
    current.activityError = activityError;
    current.promptParent = promptParent;
    sub.textContent = current.viewingHint ? `${current.range} · ${current.viewingHint}` : "Tap · → ✓ → ✗ → –. – is not counted.";
    sync.innerHTML = renderSync(current);
    doc.getElementById("weekNav").innerHTML = renderWeekNav(current);
    dayTop.innerHTML = renderDayNav(current);
    dayBottom.innerHTML = renderDayNav(current);
    app.innerHTML = renderMain(current);
    view.scrollTo(0, y);
  }

  async function copyWeek(button, weekStart, label, options = {}) {
    const text = weekSummary({ state, plan: PLAN, weekStart, full: Boolean(options.full) });
    const box = doc.getElementById("summaryBox");
    if (box) {
      box.hidden = false;
      box.textContent = text;
      selectText(box);
      box.scrollIntoView({ block: "nearest" });
    }
    button.textContent = "Copying…";
    let copied = false;
    try {
      if (view.navigator?.clipboard?.writeText) {
        await view.navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      try {
        copied = Boolean(doc.execCommand?.("copy"));
      } catch {
        copied = false;
      }
    }
    button.textContent = copied ? "Copied" : "Select the summary";
    view.setTimeout(() => {
      const live = doc.getElementById(button.id);
      if (live) live.textContent = label;
    }, 2000);
  }

  function selectText(node) {
    const selection = view.getSelection?.();
    if (!selection || !doc.createRange) return;
    const range = doc.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  doc.body.addEventListener("submit", (event) => {
    if (event.target?.id === "sync-sign-in") event.preventDefault();
  });

  doc.body.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const current = model();
    if (button.dataset.weekShift) {
      const start = addCalendarDays(current.weekStart, Number(button.dataset.weekShift) * 7);
      const days = weekDates(start);
      const logged = days.find((iso) => dayHasLog(state, start, iso));
      controller.showWeek(start, days.includes(current.today) ? current.today : logged || days[0]);
      summaryOpen = false;
      draw();
      view.scrollTo(0, 0);
      return;
    }
    if (button.dataset.date) {
      controller.selectManually(button.dataset.date);
      summaryOpen = false;
      draw();
      view.scrollTo(0, 0);
      return;
    }
    if (button.dataset.cig) {
      commit(adjustCigs(state, current.selectedDate, Number(button.dataset.cig)));
      draw();
      return;
    }
    if (button.dataset.habit) {
      const item = findHabit(current.view, button.dataset.habit);
      commit(setMark(state, current.selectedDate, button.dataset.habit, cycleMark(item?.mark || "")));
      draw();
      return;
    }
    if (button.id === "add-activity") {
      if (current.view.flexible) {
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
      const id = view.crypto?.randomUUID?.() || `window-${Date.now()}`;
      commit(addActivity(state, current.selectedDate, { id }));
      draw();
      doc.querySelector(`[data-activity="${id}"]`)?.scrollIntoView({ block: "center" });
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
    if (button.id === "copy-week") {
      void copyWeek(button, current.weekStart, "Copy week summary");
      return;
    }
    if (button.id === "copy-last-week") {
      void copyWeek(button, current.lastWeekStart, "Copy last week summary");
      return;
    }
    if (button.id === "copy-full-week") {
      void copyWeek(button, current.weekStart, "Copy full week summary", { full: true });
      return;
    }
    if (button.id === "sync-send-link") void sendLink();
    if (button.id === "sync-use-link") void useLink();
  });

  doc.body.addEventListener("input", (event) => {
    const target = event.target;
    const current = model();
    if (target.id === "cigs" || target.id === "energy") {
      commit(setDayValue(state, current.selectedDate, target.id, target.value));
      return;
    }
    if (target.id === "day-note") {
      commit(setDayNote(state, current.selectedDate, target.value));
      return;
    }
    if (target.id === "note") {
      commit(setWeekNote(state, current.selectedDate, target.value));
      return;
    }
    const field = target.getAttribute?.("data-field");
    const card = target.closest?.("[data-activity]");
    if (current.view.flexible && card && card.id !== "new-activity") {
      const activityId = card.getAttribute("data-activity");
      const result = saveFlexibleActivity(state, current.selectedDate, {
        id: activityId,
        title: card.querySelector('[data-field="title"]')?.value || "",
        start: card.querySelector('[data-field="start"]')?.value || "",
        end: card.querySelector('[data-field="end"]')?.value || "",
      });
      if (!result.ok) {
        activityError = result.error;
        const error = doc.getElementById("activity-error");
        if (error) error.textContent = result.error;
        return;
      }
      activityError = "";
      const error = doc.getElementById("activity-error");
      if (error) error.textContent = "";
      commit(result.state);
      return;
    }
    if (field && card) {
      const activityId = card.getAttribute("data-activity");
      const shown = current.view.bands.flatMap((band) => band.items).find((item) => item.id === activityId)
        || current.view.activities?.items.find((item) => item.id === activityId);
      commit(recordWindowEdit(state, current.selectedDate, {
        id: activityId,
        start: shown?.start || "",
        end: shown?.end || "",
        place: shown?.place || "",
        duration: shown?.duration || "",
      }, field, target.value));
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

  if (readSession(storage)) {
    state = queueBootstrap(state, {
      nowIso: now().toISOString(),
      legacyRaw: storage.getItem(LEGACY_STORE_KEY),
      plan: PLAN,
    });
    saveState(storage, state);
  }

  draw();
  void flushSync();

  async function sendLink() {
    const email = doc.getElementById("sync-email")?.value.trim() || "";
    syncMessage = "Sending a sign-in link…";
    draw();
    try {
      const result = await requestEmailCode(email, fetchImpl);
      syncMessage = result.ok
        ? "Check your email. Copy the link and paste it below. Do not open it in Mail."
        : sendFailure(result);
    } catch {
      syncMessage = sendFailure({ reason: "network" });
    }
    draw();
  }

  async function useLink() {
    const field = doc.getElementById("sync-link");
    const button = doc.getElementById("sync-use-link");
    const link = field?.value || "";
    if (field) field.value = "";
    syncMessage = "Checking the link…";
    if (button) {
      button.disabled = true;
      button.textContent = "Checking…";
    }
    const statusLine = doc.querySelector("#sync .sync");
    if (statusLine) statusLine.textContent = syncMessage;
    let result;
    try {
      result = await verifyMagicLink(link, fetchImpl);
    } catch {
      result = { ok: false, reason: "network" };
    }
    if (!result.ok) {
      syncMessage = signInFailure(result.reason);
      draw();
      return;
    }
    writeSession(storage, result.session);
    syncMessage = "Signed in. Logs stay on this phone.";
    state = queueBootstrap(state, {
      nowIso: now().toISOString(),
      legacyRaw: storage.getItem(LEGACY_STORE_KEY),
      plan: PLAN,
    });
    saveState(storage, state);
    draw();
    void flushSync();
  }

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
        const result = await pushSupabase(snapshot, { session: readSession(storage), fetch: fetchImpl });
        if (seen !== revision) {
          flushAgain = true;
          continue;
        }
        if (result.status === "unsigned") continue;
        state = result.state;
        saveState(storage, state);
        draw();
      } while (flushAgain);
    } finally {
      flushing = false;
    }
  }
}

function dayHasLog(state, weekStart, iso) {
  const day = state.weeks?.[weekStart]?.days?.[iso];
  if (!day) return false;
  if (day.cigs || day.energy || day.note || day.activities?.length) return true;
  if (day.calls?.mother?.done || day.calls?.father?.done) return true;
  return Object.keys(day.marks || {}).length > 0;
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
  if (current === "no") return "skip";
  if (current === "skip") return "";
  return "yes";
}

function summaryText(current) {
  const lines = [current.heading];
  if (current.view.banner) lines.push(current.view.banner);
  for (const band of current.view.bands) {
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
