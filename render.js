const FIELD_LABELS = {
  start: "From",
  end: "To",
  place: "Where you went",
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
  const bands = model.view.bands
    .map((band) => `<section><h2>${escapeHtml(band.title)}</h2>${band.items.map(renderHabit).join("")}</section>`)
    .join("");
  return `<h2 class="day-heading">${escapeHtml(model.heading)}</h2>${banner}${bands}${renderActivities(model)}${renderLog(model)}`;
}

function renderHabit(item) {
  const time = item.time ? `<span class="time">${escapeHtml(item.time)}</span>` : "";
  const note = item.note ? `<span class="note">${escapeHtml(item.note)}</span>` : "";
  const markClass = item.mark === "yes" || item.mark === "no" ? ` ${item.mark}` : "";
  const symbol = item.mark === "yes" ? "✓" : item.mark === "no" ? "✗" : "·";
  return `<button type="button" class="row" data-habit="${escapeHtml(item.id)}"><div class="mark${markClass}">${symbol}</div><div class="label">${escapeHtml(item.label)}${time}${note}</div></button>`;
}

function renderActivities(model) {
  const activities = model.view.activities;
  if (!activities) return "";
  const cards = activities.items.map((item) => {
    const fields = activities.fields
      .map((field) => {
        const type = FIELD_TYPES[field] || "text";
        return `<label>${escapeHtml(FIELD_LABELS[field] || field)}<input type="${type}" data-field="${escapeHtml(field)}" value="${escapeHtml(item[field] || "")}" placeholder="${escapeHtml(FIELD_LABELS[field] || "")}"></label>`;
      })
      .join("");
    return `<div class="activity" data-activity="${escapeHtml(item.id)}">${fields}<button type="button" class="btn secondary" data-remove-activity="${escapeHtml(item.id)}">Remove</button></div>`;
  });
  const empty = cards.length ? "" : `<p class="hint">None yet.</p>`;
  return `<section class="activities"><h2>Windows</h2><p class="hint">Add a time range, where you went, and how long.</p>${empty}${cards.join("")}<div class="actions"><button type="button" class="btn" id="add-activity">Add a window</button></div></section>`;
}

function renderLog(model) {
  return `<section><h2>This day</h2><div class="fields">
    <label>Cigarettes (count)<input id="cigs" inputmode="numeric" autocomplete="off" value="${escapeHtml(model.cigs)}"></label>
    <label>Energy 1–10<input id="energy" inputmode="numeric" autocomplete="off" value="${escapeHtml(model.energy)}"></label>
    <label>Note for the week<textarea id="note" rows="3" placeholder="Optional">${escapeHtml(model.note)}</textarea></label>
  </div>
  <div class="actions">
    <button type="button" class="btn" id="build-summary">Build summary</button>
    <button type="button" class="btn secondary" id="copy-summary" hidden>Copy summary</button>
    <pre id="summaryBox" hidden></pre>
    <button type="button" class="btn secondary" id="clear-day">Clear this day's marks</button>
  </div></section>`;
}
