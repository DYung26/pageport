import test from "node:test";
import assert from "node:assert/strict";

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    },
  };
}

test("captures and updates pages through the service worker", async () => {
  let storedState;
  let activeTab = { url: "https://example.com/docs", title: "Example docs" };
  let createdMenu;
  let panelBehavior;
  const installed = createEvent();
  const contextMenuClicked = createEvent();
  const command = createEvent();
  const message = createEvent();

  globalThis.chrome = {
    runtime: { onInstalled: installed, onMessage: message },
    contextMenus: {
      onClicked: contextMenuClicked,
      removeAll(callback) { callback(); },
      create(options) { createdMenu = options; },
    },
    commands: { onCommand: command },
    sidePanel: {
      async setPanelBehavior(options) { panelBehavior = options; },
    },
    tabs: {
      async query() { return [activeTab]; },
    },
    storage: {
      local: {
        async get(key) { return { [key]: storedState }; },
        async set(values) { storedState = values["pageport-state"]; },
      },
    },
  };

  await import("../src/background.js");
  installed.listeners[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(panelBehavior, { openPanelOnActionClick: true });
  assert.equal(createdMenu.id, "pageport-save-page");

  async function sendMessage(type) {
    return new Promise((resolve) => {
      const keepChannelOpen = message.listeners[0]({ type }, {}, resolve);
      assert.equal(keepChannelOpen, true);
    });
  }

  const firstResponse = await sendMessage("SAVE_ACTIVE_PAGE");
  assert.equal(firstResponse.page.url, "https://example.com/docs");
  assert.equal(storedState.pages.length, 1);
  const originalId = storedState.pages[0].id;

  activeTab = { url: "https://example.com/docs", title: "Updated title" };
  await sendMessage("SAVE_ACTIVE_PAGE");
  assert.equal(storedState.pages.length, 1);
  assert.equal(storedState.pages[0].id, originalId);
  assert.equal(storedState.pages[0].title, "Updated title");

  activeTab = { url: "chrome://settings", title: "Settings" };
  const rejectedResponse = await sendMessage("SAVE_ACTIVE_PAGE");
  assert.equal(rejectedResponse.error, "Only web pages can be saved.");

  await contextMenuClicked.listeners[0]({ linkUrl: "https://docs.example.org/help", linkText: "Help centre" }, activeTab);
  assert.ok(storedState.pages.some((page) => page.title === "Help centre" && page.origin === "https://docs.example.org"));
});
