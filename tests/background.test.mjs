import test from "node:test";
import assert from "node:assert/strict";

function createEvent() {
  const listeners = [];
  const registrations = [];
  return {
    listeners,
    registrations,
    addListener(listener, filters) {
      listeners.push(listener);
      registrations.push({ listener, filters });
    },
  };
}

test("routes normal browser actions to the side panel and isolates Pageport windows per PWA window", async () => {
  let storedState;
  const normalTab = { id: 1, windowId: 10, url: "https://example.com/docs", title: "Example docs" };
  const appOneTab = { id: 2, windowId: 20, url: "https://app-one.example.com/home", title: "App One" };
  const appTwoTab = { id: 3, windowId: 30, url: "https://app-two.example.com/home", title: "App Two" };
  const tabsByWindow = new Map([[10, [normalTab]], [20, [appOneTab]], [30, [appTwoTab]]]);
  const windowTypes = new Map([[10, "normal"], [20, "app"], [30, "app"]]);
  const popupTabs = [];
  const createdWindows = [];
  const focusedWindows = [];
  const removedWindows = [];
  const updatedTabs = [];
  const openedPanels = [];
  const closedPanels = [];
  const apiCalls = [];
  const createdMenus = [];
  let panelBehavior;
  let lastFocusedWindow = { id: 20, type: "app" };
  const installed = createEvent();
  const contextMenuClicked = createEvent();
  const command = createEvent();
  const windowRemoved = createEvent();
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
    windows: {
      onRemoved: windowRemoved,
      async get(id) {
        apiCalls.push(["windows.get", id]);
        return { id, type: windowTypes.get(id) ?? "normal" };
      },
      async getLastFocused(options) {
        assert.deepEqual(options, { windowTypes: ["app", "normal"] });
        return lastFocusedWindow;
      },
      async create(options) {
        createdWindows.push(options);
        const windowId = 100 + createdWindows.length;
        windowTypes.set(windowId, "popup");
        popupTabs.push({ id: 200 + createdWindows.length, windowId, url: options.url });
        return { id: windowId };
      },
      async update(id, options) { focusedWindows.push({ id, ...options }); },
      async remove(id) {
        removedWindows.push(id);
        const index = popupTabs.findIndex((tab) => tab.windowId === id);
        if (index !== -1) popupTabs.splice(index, 1);
      },
    },
    tabs: {
      async query(options = {}) {
        if (options.url) return popupTabs;
        if (Number.isInteger(options.windowId)) {
          return (tabsByWindow.get(options.windowId) ?? []).filter((tab) => !options.active || tab.active !== false);
        }
        return [normalTab];
      },
      async update(id, options) {
        const tab = [...tabsByWindow.values()].flat().find((item) => item.id === id);
        const popupTab = popupTabs.find((item) => item.id === id);
        const target = tab ?? popupTab;
        if (target) Object.assign(target, options);
        updatedTabs.push({ id, ...options });
        return target;
      },
    },
    sidePanel: {
      async setPanelBehavior(options) { panelBehavior = options; },
      open(options) {
        apiCalls.push(["sidePanel.open", options]);
        openedPanels.push(options);
        if (windowTypes.get(options.windowId) === "app") {
          return Promise.reject(new Error("Side panels are not supported in app windows"));
        }
        return Promise.resolve();
      },
      async close(options) { closedPanels.push(options); },
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
  assert.deepEqual(createdMenus.map((item) => item.id), [
    "pageport-open-pageport",
    "pageport-close-pageport",
    "pageport-save-page",
  ]);
  assert.deepEqual(windowRemoved.registrations[0].filters, { windowTypes: ["app"] });

  await contextMenuClicked.listeners[0]({ menuItemId: "pageport-open-pageport" }, normalTab);
  assert.deepEqual(openedPanels[0], { windowId: normalTab.windowId });
  assert.deepEqual(apiCalls.slice(0, 2).map(([name]) => name), ["sidePanel.open", "windows.get"], "sidePanel.open runs before the first await");
  assert.equal(createdWindows.length, 0, "normal browser windows do not create popup windows");
  await contextMenuClicked.listeners[0]({ menuItemId: "pageport-close-pageport" }, normalTab);
  assert.deepEqual(closedPanels, [{ windowId: normalTab.windowId }], "closing from a browser page closes only that window's side panel");

  await command.listeners[0]("open-pageport", normalTab);
  assert.deepEqual(openedPanels[1], { windowId: normalTab.windowId }, "the keyboard command uses the tab supplied by Chrome");
  assert.equal(createdWindows.length, 0);

  await command.listeners[0]("open-pageport");
  assert.equal(createdWindows.length, 1, "a shortcut without a tab uses the last-focused window only when it is a PWA");
  assert.equal(new URL(createdWindows[0].url).searchParams.get("sourceWindowId"), "20");

  lastFocusedWindow = { id: 10, type: "normal" };
  const originalWarn = console.warn;
  let normalWindowWarnings = 0;
  console.warn = () => { normalWindowWarnings += 1; };
  await command.listeners[0]("open-pageport");
  console.warn = originalWarn;
  assert.equal(normalWindowWarnings, 1, "without tab context, a normal window is not guessed as the shortcut source");
  assert.equal(createdWindows.length, 1);

  await command.listeners[0]("open-pageport", appOneTab);
  assert.equal(createdWindows.length, 1, "the shortcut with the original tab reuses its app window popup");
  assert.equal(createdWindows[0].type, "popup");
  assert.equal(new URL(createdWindows[0].url).searchParams.get("sourceWindowId"), "20");

  await contextMenuClicked.listeners[0]({ menuItemId: "pageport-open-pageport" }, appTwoTab);
  assert.equal(createdWindows.length, 2, "a different PWA window gets its own Pageport window");
  assert.equal(new URL(createdWindows[0].url).searchParams.get("sourceWindowId"), "20");
  assert.equal(new URL(createdWindows[1].url).searchParams.get("sourceWindowId"), "30");

  await command.listeners[0]("open-pageport", appOneTab);
  assert.equal(createdWindows.length, 2, "reopening from the first PWA reuses only its associated Pageport window");
  assert.deepEqual(focusedWindows, [
    { id: popupTabs[0].windowId, focused: true },
    { id: popupTabs[0].windowId, focused: true },
  ]);
  assert.equal(updatedTabs[0].id, popupTabs[0].id);
  assert.equal(new URL(popupTabs[0].url).searchParams.get("sourceWindowId"), "20");
  assert.equal(new URL(popupTabs[1].url).searchParams.get("sourceWindowId"), "30");

  const firstAppPopupWindowId = popupTabs[0].windowId;
  await contextMenuClicked.listeners[0]({ menuItemId: "pageport-close-pageport" }, appOneTab);
  assert.deepEqual(removedWindows, [firstAppPopupWindowId], "closing from one PWA removes only its associated Pageport popup");
  assert.equal(popupTabs.some((tab) => new URL(tab.url).searchParams.get("sourceWindowId") === "30"), true);
  await contextMenuClicked.listeners[0]({ menuItemId: "pageport-open-pageport" }, appOneTab);
  assert.equal(createdWindows.length, 3, "opening again creates a new popup after its own popup was closed");
  const replacementAppPopup = popupTabs.find((tab) => new URL(tab.url).searchParams.get("sourceWindowId") === "20");
  assert.ok(replacementAppPopup);

  async function sendMessage(payload) {
    return new Promise((resolve) => {
      const keepChannelOpen = message.listeners[0](payload, {}, resolve);
      assert.equal(keepChannelOpen, true);
    });
  }

  const appOnePage = await sendMessage({ type: "GET_ACTIVE_PAGE", windowId: 20 });
  const appTwoPage = await sendMessage({ type: "GET_ACTIVE_PAGE", windowId: 30 });
  assert.equal(appOnePage.page.url, appOneTab.url);
  assert.equal(appTwoPage.page.url, appTwoTab.url);

  lastFocusedWindow = { id: 30, type: "app" };
  await command.listeners[0]("save-current-page");
  assert.ok(storedState.pages.some((page) => page.url === appTwoTab.url), "a shortcut without tab context saves from the last-focused PWA");

  const appOneSaved = await sendMessage({ type: "SAVE_ACTIVE_PAGE", windowId: 20 });
  const appTwoSaved = await sendMessage({ type: "SAVE_ACTIVE_PAGE", windowId: 30 });
  assert.equal(appOneSaved.page.url, appOneTab.url);
  assert.equal(appTwoSaved.page.url, appTwoTab.url);
  assert.equal(storedState.pages.length, 2);

  const appOneNavigation = await sendMessage({ type: "OPEN_SAVED_PAGE", windowId: 20, url: "https://saved.example.com/one" });
  const appTwoNavigation = await sendMessage({ type: "OPEN_SAVED_PAGE", windowId: 30, url: "https://saved.example.com/two" });
  assert.equal(appOneNavigation.tabId, appOneTab.id);
  assert.equal(appTwoNavigation.tabId, appTwoTab.id);
  assert.equal(appOneTab.url, "https://saved.example.com/one");
  assert.equal(appTwoTab.url, "https://saved.example.com/two");
  assert.deepEqual(focusedWindows.slice(2), [
    { id: 20, focused: true },
    { id: 30, focused: true },
  ]);
  const rejectedNavigation = await sendMessage({ type: "OPEN_SAVED_PAGE", windowId: 20, url: "javascript:alert(1)" });
  assert.ok(rejectedNavigation.error);

  const missingWindow = await sendMessage({ type: "GET_ACTIVE_PAGE", windowId: 999 });
  assert.equal(missingWindow.page, null);
  assert.ok(missingWindow.error);

  windowRemoved.listeners[0](20);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(removedWindows, [firstAppPopupWindowId, replacementAppPopup.windowId], "closing a PWA closes only its currently associated Pageport popup");

  const secondAppPopup = popupTabs.find((tab) => new URL(tab.url).searchParams.get("sourceWindowId") === "30");
  secondAppPopup.windowId = normalTab.windowId;
  windowRemoved.listeners[0](30);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(removedWindows, [firstAppPopupWindowId, replacementAppPopup.windowId], "a moved Pageport tab must not cause its containing browser window to close");

  const normalSaved = await sendMessage({ type: "SAVE_ACTIVE_PAGE" });
  assert.equal(normalSaved.page.url, normalTab.url);
  assert.equal(normalSaved.page.lastUsedAt, normalSaved.page.updatedAt);
  assert.equal(normalSaved.page.archivedAt, null);
  assert.equal(storedState.pages.length, 3);

  storedState.pages = storedState.pages.map((page) => page.url === normalTab.url
    ? { ...page, archivedAt: Date.now() - 1000 }
    : page);
  normalTab.title = "Example docs updated";
  const duplicateSave = await sendMessage({ type: "SAVE_ACTIVE_PAGE" });
  assert.equal(storedState.pages.length, 3, "saving an existing URL updates its entry instead of duplicating it");
  assert.equal(duplicateSave.page.title, "Example docs updated");
  assert.equal(duplicateSave.page.archivedAt, null, "saving an archived page restores it");
  assert.equal(duplicateSave.page.lastUsedAt, duplicateSave.page.updatedAt);

  const originalNormalUrl = normalTab.url;
  normalTab.url = "chrome://settings";
  const rejectedSave = await sendMessage({ type: "SAVE_ACTIVE_PAGE" });
  assert.equal(rejectedSave.error, "Only web pages can be saved.");
  normalTab.url = originalNormalUrl;

  normalTab.url = "https://example.com/shortcut-save";
  await command.listeners[0]("save-current-page", normalTab);
  assert.ok(storedState.pages.some((page) => page.url === normalTab.url));

  await contextMenuClicked.listeners[0]({ linkUrl: "https://docs.example.org/help", linkText: "Help centre" }, normalTab);
  assert.ok(storedState.pages.some((page) => page.title === "Help centre" && page.origin === "https://docs.example.org"));
});
