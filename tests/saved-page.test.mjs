import test from "node:test";
import assert from "node:assert/strict";
import { findSavedPageByUrl, normalizeWebPageUrl } from "../src/saved-page.js";

const pages = [
  { id: "page-1", url: "https://example.com/docs" },
  { id: "page-2", url: "https://example.com/docs?tab=api" },
  { id: "page-3", url: "https://example.com/docs#install", archivedAt: 123 },
];

test("matches the active URL using the same canonical URL format as page saves", () => {
  assert.equal(findSavedPageByUrl(pages, "https://EXAMPLE.com:443/docs")?.id, "page-1");
});

test("keeps query strings and fragments significant when locating a saved page", () => {
  assert.equal(findSavedPageByUrl(pages, "https://example.com/docs?tab=api")?.id, "page-2");
  assert.equal(findSavedPageByUrl(pages, "https://example.com/docs#install")?.id, "page-3");
  assert.equal(findSavedPageByUrl(pages, "https://example.com/docs?tab=other"), null);
});

test("can locate archived pages and rejects non-web or invalid URLs", () => {
  assert.equal(findSavedPageByUrl(pages, "https://example.com/docs#install")?.archivedAt, 123);
  assert.equal(normalizeWebPageUrl("chrome://extensions"), null);
  assert.equal(normalizeWebPageUrl("not a URL"), null);
  assert.equal(findSavedPageByUrl(pages, null), null);
});
