import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("double-tap zoom is suppressed without turning off pinch zoom", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /touch-action:\s*manipulation/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(html, /maximum-scale\s*=\s*1/);
  assert.match(html, /input,\s*textarea,\s*select\s*\{[^}]*font-size:\s*16px/s);
});
