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
