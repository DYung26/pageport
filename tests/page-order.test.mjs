import test from "node:test";
import assert from "node:assert/strict";
import { sortPagesByLastUsed } from "../src/page-order.js";

test("sorts strictly by most recent use regardless of pin state", () => {
  const pages = [
    { id: "pinned-old", pinned: true, lastUsedAt: 10 },
    { id: "newest", pinned: false, lastUsedAt: 30 },
    { id: "middle", pinned: true, lastUsedAt: 20 },
  ];

  assert.deepEqual(sortPagesByLastUsed(pages).map((page) => page.id), ["newest", "middle", "pinned-old"]);
  assert.deepEqual(pages.map((page) => page.id), ["pinned-old", "newest", "middle"]);
});

test("sorts starred pages ahead of every unstarred page in grouped view", async () => {
  const { sortPagesForGroupedView } = await import("../src/page-order.js");
  const pages = [
    { id: "ordinary-new", pinned: false, lastUsedAt: 100 },
    { id: "starred-old", pinned: true, lastUsedAt: 10 },
    { id: "ordinary-old", pinned: false, lastUsedAt: 20 },
    { id: "starred-new", pinned: true, lastUsedAt: 30 },
  ];

  assert.deepEqual(sortPagesForGroupedView(pages).map((page) => page.id), [
    "starred-new", "starred-old", "ordinary-new", "ordinary-old",
  ]);
  assert.deepEqual(pages.map((page) => page.id), [
    "ordinary-new", "starred-old", "ordinary-old", "starred-new",
  ]);
});
