import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STATE, isValidPage, normalizeState } from "../src/storage.js";

const page = (overrides = {}) => ({
  id: "page-1",
  url: "https://example.com/docs",
  title: "Documentation",
  folder: "Research",
  pinned: true,
  createdAt: 100,
  updatedAt: 200,
  ...overrides,
});

test("returns an empty default for malformed storage", () => {
  assert.deepEqual(normalizeState(null), DEFAULT_STATE);
  assert.deepEqual(normalizeState({ pages: [], folders: "bad" }), DEFAULT_STATE);
  assert.deepEqual(normalizeState({ pages: [], folders: ["General"] }).collapsedOrigins, []);
});

test("accepts only HTTP and HTTPS pages", () => {
  assert.equal(isValidPage(page()), true);
  assert.equal(isValidPage(page({ url: "javascript:alert(1)" })), false);
  assert.equal(isValidPage(page({ url: "file:///etc/passwd" })), false);
  assert.equal(isValidPage(page({ url: "not a URL" })), false);
});

test("normalizes URLs, folder references, titles, and optional flags", () => {
  const state = normalizeState({
    folders: ["Research", "Research", ""],
    pages: [page({ url: "https://EXAMPLE.com/docs", title: "x".repeat(520), folder: "Missing", pinned: "yes" })],
  });

  assert.deepEqual(state.folders, ["General", "Research"]);
  assert.equal(state.pages[0].url, "https://example.com/docs");
  assert.equal(state.pages[0].hostname, "example.com");
  assert.equal(state.pages[0].origin, "https://example.com");
  assert.equal(state.pages[0].folder, "General");
  assert.equal(state.pages[0].title.length, 500);
  assert.equal(state.pages[0].pinned, false);
});

test("drops malformed page entries", () => {
  const state = normalizeState({ folders: ["General"], pages: [page(), null, {}, page({ url: "data:text/plain,hi" })] });
  assert.equal(state.pages.length, 1);
});


test("normalizes and deduplicates persisted collapsed origins", () => {
  const state = normalizeState({
    folders: ["General"],
    pages: [],
    collapsedOrigins: [
      "https://example.com",
      "https://example.com",
      "http://example.com",
      "https://example.com:8443",
      "https://example.com/path",
      "javascript:alert(1)",
      null,
    ],
  });

  assert.deepEqual(state.collapsedOrigins, [
    "https://example.com",
    "http://example.com",
    "https://example.com:8443",
  ]);
});

test("keeps protocol and port distinct when grouping origins", () => {
  const state = normalizeState({
    folders: ["General"],
    pages: [
      page({ id: "https", url: "https://example.com/docs" }),
      page({ id: "http", url: "http://example.com/docs" }),
      page({ id: "port", url: "https://example.com:8443/docs" }),
    ],
  });

  assert.deepEqual(state.pages.map((savedPage) => savedPage.origin), [
    "https://example.com",
    "http://example.com",
    "https://example.com:8443",
  ]);
});

test("migrates legacy usage timestamps and normalizes archive state", () => {
  const state = normalizeState({
    folders: ["General"],
    pages: [
      page({ updatedAt: 321 }),
      page({ id: "archived", updatedAt: 654, archivedAt: 987, lastUsedAt: 456 }),
      page({ id: "invalid", updatedAt: 999, archivedAt: "yesterday" }),
    ],
  });

  assert.equal(state.pages[0].lastUsedAt, 321);
  assert.equal(state.pages[0].archivedAt, null);
  assert.equal(state.pages[1].lastUsedAt, 456);
  assert.equal(state.pages[1].archivedAt, 987);
  assert.equal(state.pages[2].lastUsedAt, 999);
  assert.equal(state.pages[2].archivedAt, null);
});

test("reads and writes saved pages through extension local storage", async () => {
  const previousChrome = globalThis.chrome;
  const values = {};
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          return { [key]: values[key] };
        },
        async set(update) {
          Object.assign(values, update);
        },
      },
    },
  };

  try {
    const { readState, writeState } = await import("../src/storage.js");
    const original = {
      folders: ["Research"],
      pages: [page({ lastUsedAt: 180, archivedAt: 170 })],
      collapsedOrigins: ["https://example.com"],
    };

    await writeState(original);
    const restored = await readState();

    assert.deepEqual(restored.folders, ["General", "Research"]);
    assert.equal(restored.pages.length, 1);
    assert.equal(restored.pages[0].url, "https://example.com/docs");
    assert.equal(restored.pages[0].lastUsedAt, 180);
    assert.equal(restored.pages[0].archivedAt, 170);
    assert.deepEqual(restored.collapsedOrigins, ["https://example.com"]);
    assert.ok(values["pageport-state"]);
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});
