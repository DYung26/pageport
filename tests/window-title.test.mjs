import test from "node:test";
import assert from "node:assert/strict";
import { getPageportWindowTitle } from "../src/window-title.js";

test("uses the source PWA page title in the Pageport window title", () => {
  assert.equal(getPageportWindowTitle({ title: "MetaMCP" }), "Pageport — MetaMCP");
});

test("trims a source title and falls back to the page hostname", () => {
  assert.equal(getPageportWindowTitle({ title: "  GitHub  ", url: "https://github.com" }), "Pageport — GitHub");
  assert.equal(getPageportWindowTitle({ url: "https://app.example.com/home" }), "Pageport — app.example.com");
});

test("uses the generic title when no source page is available", () => {
  assert.equal(getPageportWindowTitle(null), "Pageport");
  assert.equal(getPageportWindowTitle({ url: "not a URL" }), "Pageport");
});
