const FIELD_LABELS = {
  start: "From",
  end: "To",
  place: "Where / activity",
  duration: "Duration",
};

const FIELD_TYPES = {
  start: "time",
  end: "time",
  place: "text",
  duration: "text",
};

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderPage(model) {
  return `${renderSync(model)}<p class="range">${escapeHtml(model.range)}</p>${renderDayNav(model)}${renderMain(model)}`;
}

export function renderSync(model) {
  return `<p class="sync">${escapeHtml(model.syncLabel)}</p>`;
}

export function renderDayNav(model) {
  return model.days
    .map((day) => {
      const classes = [day.isSelected ? "active" : "", day.isToday ? "today" : ""].filter(Boolean).join(" ");
      const classAttr = classes ? ` class="${classes}"` : "";
      const dom = String(Number(day.iso.slice(8)));
      return `<button type="button" data-date="${escapeHtml(day.iso)}"${classAttr}><span class="dow">${escapeHtml(day.short)}</span><span class="dom">${dom}</span></button>`;
    })
    .join("");
}

export function renderMain(model) {
  const banner = model.view.banner
    ? `<section><h2>Open day</h2><div class="row static"><div class="mark">—</div><div class="label">${escapeHtml(model.view.banner)}</div></div></section>`
    : "";
  if (model.view.flexible) {
    return `<h2 class="day-heading">${escapeHtml(model.heading)}</h2>${banner}${renderNamedHabits("Prayers", model.view.prayers)}${renderFlexibleActivities(model)}${renderNamedHabits("Check-ins", model.view.checkins)}${renderNamedHabits("Saved checks", model.view.preserved)}${renderLog(model)}`;
  }
  const bands = (model.view.bands || [])
    .map((band) => `<section><h2>${escapeHtml(band.title)}</h2>${band.items.map(renderItem).join("")}</section>`)
    .join("");
  return `<h2 class="day-heading">${escapeHtml(model.heading)}</h2>${banner}${bands}${renderActivities(model)}${renderLog(model)}`;
}

function renderNamedHabits(title, items) {
  if (!items?.length) return "";
  return `<section><h2>${escapeHtml(title)}</h2>${items.map(renderHabit).join("")}</section>`;
}

function renderItem(item) {
  if (item.kind === "window") return renderWindow(item, false);
  return renderHabit(item);
}

function renderHabit(item) {
  const time = item.time ? `<span class="time">${escapeHtml(item.time)}</span>` : "";
  const note = item.note ? `<span class="note">${escapeHtml(item.note)}</span>` : "";
  const markClass = item.mark === "yes" || item.mark === "no" ? ` ${item.mark}` : "";
  const symbol = item.mark === "yes" ? "✓" : item.mark === "no" ? "✗" : "·";
  return `<button type="button" class="row" data-habit="${escapeHtml(item.id)}"><div class="mark${markClass}">${symbol}</div><div class="label">${escapeHtml(item.label)}${time}${note}</div></button>`;
}

function renderWindow(item, removable) {
  const fields = ["start", "end", "place", "duration"]
    .map((field) => {
      const type = FIELD_TYPES[field] || "text";
      return `<label>${escapeHtml(FIELD_LABELS[field] || field)}<input type="${type}" data-field="${escapeHtml(field)}" value="${escapeHtml(item[field] || "")}" placeholder="${escapeHtml(FIELD_LABELS[field] || "")}"></label>`;
    })
    .join("");
  const hint = item.time ? `<span class="time">${escapeHtml(item.time)}</span>` : "";
  const remove = removable
    ? `<button type="button" class="btn secondary" data-remove-activity="${escapeHtml(item.id)}">Remove</button>`
    : "";
  return `<div class="activity" data-activity="${escapeHtml(item.id)}"><div class="window-title"><strong>${escapeHtml(item.label)}</strong>${hint}</div>${fields}${remove}</div>`;
}

function renderFlexibleActivities(model) {
  const items = model.view.activities?.items || [];
  const cards = items.map((item) => {
    const duration = item.duration ? `<p class="hint">${escapeHtml(item.duration)}</p>` : "";
    return `<div class="activity" data-activity="${escapeHtml(item.id)}"><label>Title / where<input data-field="title" value="${escapeHtml(item.title || "")}" placeholder="Title / where"></label><label>From<input type="time" data-field="start" value="${escapeHtml(item.start || "")}"></label><label>To<input type="time" data-field="end" value="${escapeHtml(item.end || "")}"></label>${duration}<button type="button" class="btn secondary" data-remove-activity="${escapeHtml(item.id)}">Remove</button></div>`;
  }).join("");
  const error = model.activityError ? `<p class="form-error" id="activity-error">${escapeHtml(model.activityError)}</p>` : `<p class="form-error" id="activity-error"></p>`;
  return `<section class="activities"><h2>Activities</h2><p class="hint">Add what you did, with a start and end. Times can meet, and they can cross a prayer.</p>${error}${cards}<div class="activity" id="new-activity"><label>Title / where<input id="activity-title" placeholder="Title / where"></label><label>From<input id="activity-start" type="time"></label><label>To<input id="activity-end" type="time"></label><div class="actions"><button type="button" class="btn" id="add-activity">Add</button></div></div></section>`;
}

function renderActivities(model) {
  const activities = model.view.activities;
  if (!activities) return "";
  const cards = activities.items.map((item) => renderWindow(item, true));
  const empty = cards.length ? "" : `<p class="hint">None yet.</p>`;
  return `<section class="activities"><h2>Extra windows</h2><p class="hint">Add another time range if you need one.</p>${empty}${cards.join("")}<div class="actions"><button type="button" class="btn" id="add-activity">Add a window</button></div></section>`;
}

function renderCall(model, parent, label) {
  const call = model.calls?.[parent] || { done: false, note: "" };
  const checked = call.done ? " checked" : "";
  return `<label class="call-row"><input type="checkbox" id="call-${parent}"${checked}> ${escapeHtml(label)}</label>`;
}

function renderLog(model) {
  return `<section><h2>This day</h2><div class="fields">
    <label>Cigarettes (count)<input id="cigs" inputmode="numeric" autocomplete="off" value="${escapeHtml(model.cigs)}"></label>
    <label>Energy 1–10<input id="energy" inputmode="numeric" autocomplete="off" value="${escapeHtml(model.energy)}"></label>
    <label>Note for the week<textarea id="note" rows="3" placeholder="Optional">${escapeHtml(model.note)}</textarea></label>
  </div>
  <div class="calls">
    ${renderCall(model, "mother", "Call mother")}
    ${renderCall(model, "father", "Call father")}
    <p class="hint">Stays on this phone with the rest of the day.</p>
    <div id="call-prompt"${model.promptParent ? ` data-parent="${escapeHtml(model.promptParent)}"` : " hidden"}>
      <p>How did the call go?</p>
      <textarea id="call-response" rows="2" placeholder="Optional"></textarea>
      <div class="actions">
        <button type="button" class="btn" id="call-save">Save</button>
        <button type="button" class="btn secondary" id="call-skip">Skip</button>
      </div>
    </div>
  </div>
  <div class="actions">
    <button type="button" class="btn" id="build-summary">Build summary</button>
    <button type="button" class="btn secondary" id="copy-summary" hidden>Copy summary</button>
    <pre id="summaryBox" hidden></pre>
    <button type="button" class="btn secondary" id="clear-day">Clear this day's marks</button>
  </div></section>`;
}
