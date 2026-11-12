import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sidepanel, stylesheet] = await Promise.all([
  readFile(new URL("../src/sidepanel.js", import.meta.url), "utf8"),
  readFile(new URL("../sidepanel.css", import.meta.url), "utf8"),
]);

test("renders the origin chevron as a decorative CSS icon instead of a text glyph", () => {
  assert.match(sidepanel, /chevron\.className = "origin-chevron"/);
  assert.match(sidepanel, /chevron\.setAttribute\("aria-hidden", "true"\)/);
  assert.doesNotMatch(sidepanel, /chevron\.textContent\s*=/);
  assert.match(stylesheet, /\.origin-chevron::before\s*\{[^}]*border-right:[^}]*border-bottom:/);
  assert.match(stylesheet, /\.origin-toggle\[aria-expanded="false"\] \.origin-chevron::before\s*\{[^}]*rotate\(-45deg\)/);
  assert.match(stylesheet, /\.origin-chevron::before\s*\{[^}]*rotate\(45deg\)/);
});
