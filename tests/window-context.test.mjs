import test from "node:test";
import assert from "node:assert/strict";
import { resolveOwningWindowId } from "../src/window-context.js";

test("uses the explicitly supplied Pageport app window", async () => {
  let currentWindowLookups = 0;
  const windowsApi = {
    async getCurrent() { currentWindowLookups += 1; return { id: 10 }; },
    async getLastFocused() { throw new Error("must not query focus"); },
  };

  assert.equal(await resolveOwningWindowId(20, windowsApi), 20);
  assert.equal(currentWindowLookups, 0);
});

test("binds a normal side panel to its containing window, not the last focused window", async () => {
  const calls = [];
  const windowsApi = {
    async getCurrent() { calls.push("current"); return { id: 10, type: "normal" }; },
    async getLastFocused() { calls.push("last-focused"); return { id: 30, type: "normal" }; },
  };

  assert.equal(await resolveOwningWindowId(null, windowsApi), 10);
  assert.deepEqual(calls, ["current"]);
});

test("uses the last-focused window only when the extension context has no current window", async () => {
  const calls = [];
  const windowsApi = {
    async getCurrent() { calls.push("current"); return {}; },
    async getLastFocused(options) {
      calls.push(["last-focused", options]);
      return { id: 30, type: "normal" };
    },
  };

  assert.equal(await resolveOwningWindowId(null, windowsApi), 30);
  assert.deepEqual(calls, ["current", ["last-focused", { windowTypes: ["app", "normal"] }]]);
});
