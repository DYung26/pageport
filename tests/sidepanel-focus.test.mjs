import test from "node:test";
import assert from "node:assert/strict";
import { bindHoverSearchFocus } from "../src/sidepanel-focus.js";

function createHarness(dialogs = []) {
  const listeners = new Map();
  const root = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const focusCalls = [];
  const searchInput = {
    focus(options) {
      focusCalls.push(options);
    },
  };

  bindHoverSearchFocus({ root, searchInput, dialogs });
  return {
    focusCalls,
    enter(pointerType) {
      listeners.get("pointerenter")?.({ pointerType });
    },
  };
}

test("focuses search when a mouse pointer enters and prevents scrolling", () => {
  const harness = createHarness();

  harness.enter("mouse");

  assert.deepEqual(harness.focusCalls, [{ preventScroll: true }]);
});

test("does not move focus for touch, pen, or unknown pointer types", () => {
  const harness = createHarness();

  harness.enter("touch");
  harness.enter("pen");
  harness.enter("");

  assert.deepEqual(harness.focusCalls, []);
});

test("does not steal focus while a Pageport dialog is open", () => {
  const folderDialog = { open: false };
  const settingsDialog = { open: true };
  const harness = createHarness([folderDialog, settingsDialog]);

  harness.enter("mouse");
  assert.deepEqual(harness.focusCalls, []);

  settingsDialog.open = false;
  folderDialog.open = true;
  harness.enter("mouse");
  assert.deepEqual(harness.focusCalls, []);

  folderDialog.open = false;
  harness.enter("mouse");
  assert.deepEqual(harness.focusCalls, [{ preventScroll: true }]);
});
