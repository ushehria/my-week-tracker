import { londonDate, nextLondonMidnight, weekDates, weekStartMonday } from "./london-time.js?v=6";


export function createViewController({ now }) {
  const clock = typeof now === "function" ? now : () => now;
  let selected = londonDate(clock());
  let anchor = selected;
  let weekStart = weekStartMonday(selected);
  return {
    selectedDate() {
      return selected;
    },
    weekStart() {
      return weekStart;
    },
    selectManually(iso) {
      selected = iso;
      weekStart = weekStartMonday(iso);
    },
    showWeek(start, iso) {
      const current = weekStartMonday(londonDate(clock()));
      if (start > current) return;
      weekStart = start;
      const days = weekDates(start);
      if (days.includes(iso)) selected = iso;
      else if (days.includes(londonDate(clock()))) selected = londonDate(clock());
      else selected = days[0];
    },
    interact() {},
    resume() {
      selected = londonDate(clock());
      anchor = selected;
      weekStart = weekStartMonday(selected);
    },
    tick() {
      const today = londonDate(clock());
      if (today !== anchor) {
        anchor = today;
        selected = today;
        weekStart = weekStartMonday(today);
      }
    },
  };
}

export function bindAutoDate(controller, doc, { now, onChange, schedule }) {
  const clock = typeof now === "function" ? now : () => now;
  let wasHidden = doc.visibilityState === "hidden";

  const apply = (method) => {
    const before = controller.selectedDate();
    controller[method]();
    if (controller.selectedDate() !== before) onChange();
  };

  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "hidden") {
      wasHidden = true;
      return;
    }
    if (doc.visibilityState === "visible" && wasHidden) {
      wasHidden = false;
      apply("resume");
    }
  });

  doc.addEventListener("pageshow", () => {
    apply("resume");
  });

  const arm = () => {
    const next = nextLondonMidnight(clock());
    const delay = Math.max(0, next.getTime() - clock().getTime());
    schedule(delay, () => {
      apply("tick");
      arm();
    });
  };
  arm();
}
