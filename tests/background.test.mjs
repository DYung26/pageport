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

test("routes Pageport to the side panel or standalone window based on the source window", async () => {
  let storedState;
  let activeTab = { id: 1, windowId: 10, url: "https://example.com/docs", title: "Example docs" };
  const tabsById = new Map([[activeTab.id, activeTab]]);
  const windowTypes = new Map([[10, "normal"]]);
  const popupTabs = [];
  const createdWindows = [];
  const focusedWindows = [];
  const updatedTabs = [];
  const openedPanels = [];
  const createdMenus = [];
  let panelBehavior;
  const installed = createEvent();
  const contextMenuClicked = createEvent();
  const command = createEvent();
  const message = createEvent();

  globalThis.chrome = {
    runtime: {
      onInstalled: installed,
      onMessage: message,
      getURL(path) { return `chrome-extension://pageport/${path}`; },
    },
    contextMenus: {
      onClicked: contextMenuClicked,
      removeAll(callback) { callback(); },
      create(options) { createdMenus.push(options); },
    },
    commands: { onCommand: command },
    sidePanel: {
      async setPanelBehavior(options) { panelBehavior = options; },
      async open(options) { openedPanels.push(options); },
    },
    windows: {
      async get(id) { return { id, type: windowTypes.get(id) ?? "normal" }; },
      async create(options) {
        createdWindows.push(options);
        const windowId = 100 + createdWindows.length;
        popupTabs.push({ id: 200 + createdWindows.length, windowId, url: options.url });
        return { id: windowId };
      },
      async update(id, options) { focusedWindows.push({ id, ...options }); },
    },
    tabs: {
      async query(options = {}) {
        if (options.url) return popupTabs;
        return [activeTab];
      },
      async get(id) {
        const tab = tabsById.get(id);
        if (!tab) throw new Error(`No tab with id ${id}`);
        return tab;
      },
      async update(id, options) {
        const tab = popupTabs.find((item) => item.id === id);
        if (tab) Object.assign(tab, options);
        updatedTabs.push({ id, ...options });
        return tab;
      },
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
  assert.deepEqual(createdMenus.map((item) => item.id), ["pageport-open-pageport", "pageport-save-page"]);

  await contextMenuClicked.listeners[0]({ menuItemId: "pageport-open-pageport" }, activeTab);
  assert.deepEqual(openedPanels, [{ windowId: 10 }]);
  assert.equal(createdWindows.length, 0);

  const appTab = { id: 2, windowId: 20, url: "https://app.example.com", title: "Installed app" };
  activeTab = appTab;
  tabsById.set(appTab.id, appTab);
  windowTypes.set(appTab.windowId, "app");
  await command.listeners[0]("open-pageport");
  assert.equal(createdWindows.length, 1);
  assert.equal(createdWindows[0].type, "popup");
  assert.equal(createdWindows[0].width, 420);
  assert.equal(new URL(createdWindows[0].url).searchParams.get("tabId"), String(appTab.id));

  const secondAppTab = { id: 3, windowId: 30, url: "https://another-app.example.com", title: "Another app" };
  activeTab = secondAppTab;
  tabsById.set(secondAppTab.id, secondAppTab);
  windowTypes.set(secondAppTab.windowId, "app");
  await command.listeners[0]("open-pageport");
  assert.equal(createdWindows.length, 1, "a second app open reuses the existing Pageport window");
  assert.equal(new URL(popupTabs[0].url).searchParams.get("tabId"), String(secondAppTab.id));
  assert.deepEqual(focusedWindows, [{ id: popupTabs[0].windowId, focused: true }]);
  assert.equal(updatedTabs[0].id, popupTabs[0].id);

  async function sendMessage(payload) {
    return new Promise((resolve) => {
      const keepChannelOpen = message.listeners[0](payload, {}, resolve);
      assert.equal(keepChannelOpen, true);
    });
  }

  const appPageResponse = await sendMessage({ type: "GET_ACTIVE_PAGE", tabId: appTab.id });
  assert.equal(appPageResponse.page.url, appTab.url);
  assert.equal(appPageResponse.tabId, appTab.id);
  const missingTabResponse = await sendMessage({ type: "GET_ACTIVE_PAGE", tabId: 999 });
  assert.equal(missingTabResponse.page, null);
  assert.ok(missingTabResponse.error);

  const appSaveResponse = await sendMessage({ type: "SAVE_ACTIVE_PAGE", tabId: appTab.id });
  assert.equal(appSaveResponse.page.url, "https://app.example.com/");

  activeTab = { id: 1, windowId: 10, url: "https://example.com/docs", title: "Example docs" };
  tabsById.set(activeTab.id, activeTab);
  const firstResponse = await sendMessage({ type: "SAVE_ACTIVE_PAGE" });
  assert.equal(firstResponse.page.url, "https://example.com/docs");
  assert.equal(storedState.pages.length, 2);
  const originalId = storedState.pages.find((page) => page.url === activeTab.url).id;

  activeTab = { ...activeTab, url: "https://example.com/docs", title: "Updated title" };
  tabsById.set(activeTab.id, activeTab);
  await sendMessage({ type: "SAVE_ACTIVE_PAGE" });
  assert.equal(storedState.pages.length, 2);
  const updatedPage = storedState.pages.find((page) => page.id === originalId);
  assert.equal(updatedPage.title, "Updated title");

  activeTab = { ...activeTab, url: "chrome://settings", title: "Settings" };
  tabsById.set(activeTab.id, activeTab);
  const rejectedResponse = await sendMessage({ type: "SAVE_ACTIVE_PAGE" });
  assert.equal(rejectedResponse.error, "Only web pages can be saved.");

  await contextMenuClicked.listeners[0]({ linkUrl: "https://docs.example.org/help", linkText: "Help centre" }, activeTab);
  assert.ok(storedState.pages.some((page) => page.title === "Help centre" && page.origin === "https://docs.example.org"));
});
