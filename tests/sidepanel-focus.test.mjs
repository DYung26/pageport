import test from "node:test";
import assert from "node:assert/strict";
import { bindHoverSearchFocus } from "../src/sidepanel-focus.js";

function createHarness(dialogs = []) {
  const listeners = new Map();
  const root = {
    addEventListener(type, listener, options = false) {
      const eventListeners = listeners.get(type) ?? [];
      eventListeners.push({ listener, options });
      listeners.set(type, eventListeners);
    },
    removeEventListener(type, listener, options = false) {
      const eventListeners = listeners.get(type) ?? [];
      listeners.set(type, eventListeners.filter((item) => item.listener !== listener || item.options !== options));
    },
  };
  const focusCalls = [];
  const searchInput = {
    focus(options) {
      focusCalls.push(options);
    },
  };

  const unbind = bindHoverSearchFocus({ root, searchInput, dialogs });
  const dispatch = (type, pointerType = "mouse") => {
    for (const { listener } of listeners.get(type) ?? []) listener({ pointerType });
  };

  return { focusCalls, dispatch, listeners, unbind };
}

test("focuses search when a mouse pointer enters and prevents scrolling", () => {
  const harness = createHarness();

  harness.dispatch("pointerenter");
  harness.dispatch("pointermove");

  assert.deepEqual(harness.focusCalls, [{ preventScroll: true }]);
});

test("uses pointer movement when the initial pointer-enter event is missed", () => {
  const harness = createHarness();

  harness.dispatch("pointermove");

  assert.deepEqual(harness.focusCalls, [{ preventScroll: true }]);
});

test("focuses only once while the pointer remains inside the panel", () => {
  const harness = createHarness();

  harness.dispatch("pointerenter");
  harness.dispatch("pointermove");
  harness.dispatch("pointermove");

  assert.deepEqual(harness.focusCalls, [{ preventScroll: true }]);
});

test("focuses again after the mouse leaves and re-enters the panel", () => {
  const harness = createHarness();

  harness.dispatch("pointerenter");
  harness.dispatch("pointermove");
  harness.dispatch("pointerleave");
  harness.dispatch("pointermove");

  assert.deepEqual(harness.focusCalls, [
    { preventScroll: true },
    { preventScroll: true },
  ]);
});

test("does not move focus for touch, pen, or unknown pointer types", () => {
  const harness = createHarness();

  for (const pointerType of ["touch", "pen", ""]) {
    harness.dispatch("pointerenter", pointerType);
    harness.dispatch("pointermove", pointerType);
  }

  assert.deepEqual(harness.focusCalls, []);
});

test("does not steal focus while a Pageport dialog is open", () => {
  const folderDialog = { open: false };
  const settingsDialog = { open: true };
  const harness = createHarness([folderDialog, settingsDialog]);

  harness.dispatch("pointerenter");
  assert.deepEqual(harness.focusCalls, []);

  settingsDialog.open = false;
  folderDialog.open = true;
  harness.dispatch("pointerleave");
  harness.dispatch("pointermove");
  assert.deepEqual(harness.focusCalls, []);

  folderDialog.open = false;
  harness.dispatch("pointerleave");
  harness.dispatch("pointermove");
  assert.deepEqual(harness.focusCalls, [{ preventScroll: true }]);
});

test("removes every hover listener when the binding is cleaned up", () => {
  const harness = createHarness();

  harness.unbind();

  assert.deepEqual([...harness.listeners.values()], [[], [], []]);
});
