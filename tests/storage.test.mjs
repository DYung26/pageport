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
      pages: [page()],
    };

    await writeState(original);
    const restored = await readState();

    assert.deepEqual(restored.folders, ["General", "Research"]);
    assert.equal(restored.pages.length, 1);
    assert.equal(restored.pages[0].url, "https://example.com/docs");
    assert.ok(values["pageport-state"]);
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});
