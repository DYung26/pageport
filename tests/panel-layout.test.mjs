import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../sidepanel.html", import.meta.url), "utf8");
const css = await readFile(new URL("../sidepanel.css", import.meta.url), "utf8");

test("keeps the header and footer outside the scrolling content", () => {
  const headerIndex = html.indexOf('<header class="topbar">');
  const contentIndex = html.indexOf('<div class="scroll-content">');
  const welcomeIndex = html.indexOf('<section class="welcome">');
  const scrollEndIndex = html.indexOf('</div>\n\n      <footer class="footer">');
  const footerIndex = html.indexOf('<footer class="footer">');

  assert.ok(headerIndex >= 0 && headerIndex < contentIndex);
  assert.ok(contentIndex < welcomeIndex && welcomeIndex < scrollEndIndex);
  assert.ok(scrollEndIndex < footerIndex);
});

test("shows the current browser window tabs with saved and unsaved filters", () => {
  const windowSection = html.indexOf('<section class="window-tabs"');
  const controlsSection = html.indexOf('<section class="controls"');
  assert.ok(windowSection >= 0 && windowSection < controlsSection);
  assert.match(html, /data-window-filter="all"/);
  assert.match(html, /data-window-filter="saved"/);
  assert.match(html, /data-window-filter="unsaved"/);
  assert.match(html, /id="window-tab-list"/);
  assert.match(css, /\.window-tab-list\s*\{[^}]*max-height:\s*300px;[^}]*overflow-y:\s*auto;/s);
});

test("overlays fixed header and footer above full-width content that scrolls underneath", () => {
  assert.match(css, /body\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.shell\s*\{[^}]*position:\s*relative;[^}]*height:\s*100dvh;/s);
  assert.match(css, /\.topbar\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0;[^}]*left:\s*12px;[^}]*right:\s*12px;[^}]*z-index:\s*2;/s);
  assert.match(css, /\.scroll-content\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*padding:\s*56px 12px calc\(58px \+ env\(safe-area-inset-bottom\)\);/s);
  assert.match(css, /\.footer\s*\{[^}]*position:\s*absolute;[^}]*left:\s*12px;[^}]*right:\s*12px;[^}]*bottom:\s*0;[^}]*z-index:\s*2;/s);
});

test("keeps the hero full-bleed while the text and library retain consistent gutters", () => {
  assert.match(css, /\.shell\s*\{[^}]*padding:\s*0;/s);
  assert.match(css, /\.scroll-content\s*\{[^}]*inset:\s*0;[^}]*padding:\s*56px 12px calc\(58px \+ env\(safe-area-inset-bottom\)\);/s);
  assert.match(css, /\.welcome\s*\{[^}]*margin:\s*24px -12px 0;[^}]*padding:\s*24px 12px 20px 8px;/s);
});

test("uses a thin scrollbar and keeps stylesheet braces balanced", () => {
  assert.match(css, /\.scroll-content\s*\{[^}]*scrollbar-width:\s*thin;/s);
  assert.match(css, /\.scroll-content::-webkit-scrollbar\s*\{[^}]*width:\s*8px;/s);
  assert.equal((css.match(/\{/g) ?? []).length, (css.match(/\}/g) ?? []).length);
});
