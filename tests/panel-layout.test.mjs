import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../sidepanel.html", import.meta.url), "utf8");
const css = await readFile(new URL("../sidepanel.css", import.meta.url), "utf8");

test("keeps the header and footer outside the independently scrollable content", () => {
  const headerIndex = html.indexOf("<header class=\"topbar\">");
  const contentIndex = html.indexOf("<div class=\"scroll-content\">");
  const welcomeIndex = html.indexOf("<section class=\"welcome\">");
  const scrollEndIndex = html.indexOf("</div>\n\n      <footer class=\"footer\">");
  const footerIndex = html.indexOf("<footer class=\"footer\">");

  assert.ok(headerIndex >= 0 && headerIndex < contentIndex);
  assert.ok(contentIndex < welcomeIndex && welcomeIndex < scrollEndIndex);
  assert.ok(scrollEndIndex < footerIndex);
});

test("locks the panel viewport while allowing its content region to scroll", () => {
  assert.match(css, /body\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.shell\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/s);
  assert.match(css, /\.scroll-content\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.topbar\s*\{[^}]*z-index:\s*2;/s);
  assert.match(css, /\.footer\s*\{[^}]*z-index:\s*2;/s);
});
