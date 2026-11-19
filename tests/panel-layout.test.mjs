import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../sidepanel.html", import.meta.url), "utf8");
const css = await readFile(new URL("../sidepanel.css", import.meta.url), "utf8");

test("keeps the header and footer outside the scrolling content", () => {
  const headerIndex = html.indexOf("<header class=\"topbar\">");
  const contentIndex = html.indexOf("<div class=\"scroll-content\">");
  const welcomeIndex = html.indexOf("<section class=\"welcome\">");
  const scrollEndIndex = html.indexOf("</div>\n\n      <footer class=\"footer\">");
  const footerIndex = html.indexOf("<footer class=\"footer\">");

  assert.ok(headerIndex >= 0 && headerIndex < contentIndex);
  assert.ok(contentIndex < welcomeIndex && welcomeIndex < scrollEndIndex);
  assert.ok(scrollEndIndex < footerIndex);
});

test("overlays fixed header and footer above content that scrolls underneath", () => {
  assert.match(css, /body\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.shell\s*\{[^}]*position:\s*relative;[^}]*height:\s*100dvh;/s);
  assert.match(css, /\.topbar\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0;[^}]*z-index:\s*2;/s);
  assert.match(css, /\.scroll-content\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0;[^}]*left:\s*18px;[^}]*right:\s*18px;[^}]*bottom:\s*0;[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*padding:\s*56px 0 calc\(58px \+ env\(safe-area-inset-bottom\)\);/s);
  assert.match(css, /\.footer\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*0;[^}]*z-index:\s*2;/s);
});


test("keeps the scrolled content inset from the panel edges while the welcome section bleeds full width", () => {
  assert.match(css, /\.shell\s*\{[^}]*padding:\s*0 18px;/s);
  assert.match(css, /\.scroll-content\s*\{[^}]*left:\s*18px;[^}]*right:\s*18px;/s);
  assert.match(css, /\.welcome\s*\{[^}]*margin:\s*24px -18px 0;/s);
});
