import { londonDate, nextLondonMidnight } from "./london-time.js?v=6";

export function createViewController({ now }) {
  const clock = typeof now === "function" ? now : () => now;
  let selected = londonDate(clock());
  let anchor = selected;
  return {
    selectedDate() {
      return selected;
    },
    selectManually(iso) {
      selected = iso;
    },
    interact() {},
    resume() {
      selected = londonDate(clock());
      anchor = selected;
    },
    tick() {
      const today = londonDate(clock());
      if (today !== anchor) {
        anchor = today;
        selected = today;
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
