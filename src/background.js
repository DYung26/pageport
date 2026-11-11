import { readState, writeState } from "./storage.js";

const MENU_OPEN_PAGEPORT = "pageport-open-pageport";
const MENU_CLOSE_PAGEPORT = "pageport-close-pageport";
const MENU_SAVE_PAGE = "pageport-save-page";
const MESSAGE_SAVE_ACTIVE_PAGE = "SAVE_ACTIVE_PAGE";
const MESSAGE_GET_ACTIVE_PAGE = "GET_ACTIVE_PAGE";
const MESSAGE_OPEN_SAVED_PAGE = "OPEN_SAVED_PAGE";
const pendingPageportWindows = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_OPEN_PAGEPORT,
      title: "Open Pageport",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: MENU_CLOSE_PAGEPORT,
      title: "Close Pageport",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: MENU_SAVE_PAGE,
      title: "Save page to Pageport",
      contexts: ["page", "link"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_OPEN_PAGEPORT) {
    await openPageport(tab);
    return;
  }

  if (info.menuItemId === MENU_CLOSE_PAGEPORT) {
    await closePageport(tab);
    return;
  }

  const url = info.linkUrl || tab?.url;
  if (url && isWebPageUrl(url)) await savePage({ url, title: info.linkText || tab?.title });
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "open-pageport") {
    const opening = tab?.id && Number.isInteger(tab.windowId)
      ? openPageport(tab)
      : openPageportInLastFocusedAppWindow();
    return opening.catch((error) => {
      console.error("Couldn't open Pageport:", error);
    });
  }

  if (command === "save-current-page") {
    if (tab?.url && isWebPageUrl(tab.url)) {
      return savePage({ url: tab.url, title: tab.title });
    }

    return getLastFocusedTab().then((activeTab) => {
      if (activeTab?.url && isWebPageUrl(activeTab.url)) {
        return savePage({ url: activeTab.url, title: activeTab.title });
      }
    });
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  void closePageportWindowForSource(windowId).catch((error) => {
    console.error("Couldn't close the Pageport window for a closed app:", error);
  });
}, { windowTypes: ["app"] });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MESSAGE_SAVE_ACTIVE_PAGE) {
    getActiveTab(message.windowId).then((tab) => {
      if (!tab?.url) throw new Error("The active tab has no saveable URL.");
      return savePage({ url: tab.url, title: tab.title });
    }).then((page) => sendResponse({ page })).catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === MESSAGE_GET_ACTIVE_PAGE) {
    getActiveTab(message.windowId).then((tab) => {
      sendResponse({ page: tab?.url ? { url: tab.url, title: tab.title } : null });
    }).catch((error) => sendResponse({ page: null, error: error.message }));
    return true;
  }

  if (message.type === MESSAGE_OPEN_SAVED_PAGE) {
    openSavedPage(message.url, message.windowId).then(
      (result) => sendResponse(result),
      (error) => sendResponse({ error: error.message }),
    );
    return true;
  }
});

async function openPageportInLastFocusedAppWindow() {
  const sourceWindow = await chrome.windows.getLastFocused({ windowTypes: ["app", "normal"] });
  if (sourceWindow?.type !== "app" || !Number.isInteger(sourceWindow.id)) {
    console.warn("Pageport could not identify an app window for this shortcut.");
    return;
  }

  await openPageportWindow(sourceWindow.id);
}

async function closePageport(sourceTab) {
  if (!Number.isInteger(sourceTab?.windowId)) return;

  const sourceWindow = await chrome.windows.get(sourceTab.windowId);
  if (sourceWindow.type === "app") {
    await closePageportWindowForSource(sourceTab.windowId);
    return;
  }

  if (typeof chrome.sidePanel.close !== "function") {
    throw new Error("Closing the side panel requires Chromium 141 or newer.");
  }
  await chrome.sidePanel.close({ windowId: sourceTab.windowId });
}

function openPageport(sourceTab) {
  if (!Number.isInteger(sourceTab?.windowId)) return Promise.resolve();

  // Start this API call immediately while the context-menu or command gesture is active.
  let sidePanelOpening;
  try {
    sidePanelOpening = chrome.sidePanel.open({ windowId: sourceTab.windowId });
  } catch (error) {
    sidePanelOpening = Promise.reject(error);
  }
  const sourceWindowLookup = chrome.windows.get(sourceTab.windowId);

  return Promise.allSettled([sidePanelOpening, sourceWindowLookup]).then(async ([panelResult, windowResult]) => {
    if (windowResult.status === "rejected") throw windowResult.reason;

    if (windowResult.value.type === "app") {
      await openPageportWindow(sourceTab.windowId);
      return;
    }

    if (panelResult.status === "rejected") throw panelResult.reason;
  });
}

function openPageportWindow(sourceWindowId) {
  const pending = pendingPageportWindows.get(sourceWindowId);
  if (pending) return pending;

  const opening = createOrFocusPageportWindow(sourceWindowId).finally(() => {
    pendingPageportWindows.delete(sourceWindowId);
  });
  pendingPageportWindows.set(sourceWindowId, opening);
  return opening;
}

async function createOrFocusPageportWindow(sourceWindowId) {
  const pageUrl = new URL(chrome.runtime.getURL("sidepanel.html"));
  pageUrl.searchParams.set("sourceWindowId", String(sourceWindowId));
  const popupUrl = pageUrl.toString();
  const pagePattern = `${chrome.runtime.getURL("sidepanel.html")}*`;
  const existingTabs = await chrome.tabs.query({ url: pagePattern });
  const existingTab = existingTabs.find((tab) => getSourceWindowId(tab.url) === sourceWindowId);

  if (existingTab?.id !== undefined && existingTab.windowId !== undefined) {
    await chrome.tabs.update(existingTab.id, { active: true });
    await chrome.windows.update(existingTab.windowId, { focused: true });
    return;
  }

  await chrome.windows.create({
    url: popupUrl,
    type: "popup",
    width: 420,
    height: 760,
    focused: true,
  });
}

async function closePageportWindowForSource(sourceWindowId) {
  const pagePattern = `${chrome.runtime.getURL("sidepanel.html")}*`;
  const pageportTabs = await chrome.tabs.query({ url: pagePattern });
  const matchingTabs = pageportTabs.filter((tab) => getSourceWindowId(tab.url) === sourceWindowId);
  const windowIds = [...new Set(matchingTabs.map((tab) => tab.windowId).filter(Number.isInteger))];
  await Promise.all(windowIds.map(async (windowId) => {
    const window = await chrome.windows.get(windowId);
    if (window.type === "popup") await chrome.windows.remove(windowId);
  }));
}

function getSourceWindowId(value) {
  try {
    const parsed = new URL(value);
    const extensionUrl = new URL(chrome.runtime.getURL("sidepanel.html"));
    if (parsed.protocol !== extensionUrl.protocol || parsed.host !== extensionUrl.host || parsed.pathname !== extensionUrl.pathname) return null;
    const sourceWindowIdValue = parsed.searchParams.get("sourceWindowId");
    if (sourceWindowIdValue === null || sourceWindowIdValue.trim() === "") return null;
    const sourceWindowId = Number(sourceWindowIdValue);
    return Number.isSafeInteger(sourceWindowId) && sourceWindowId >= 0 ? sourceWindowId : null;
  } catch {
    return null;
  }
}

async function openSavedPage(value, windowId) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("This saved address is invalid.");
  }
  if (!isWebPageUrl(url.href)) throw new Error("Only web pages can be opened.");

  const tab = await getActiveTab(windowId);
  if (!tab?.id) throw new Error("No active tab is available in the target window.");
  await chrome.tabs.update(tab.id, { url: url.href });
  if (Number.isInteger(windowId)) await chrome.windows.update(windowId, { focused: true });
  return { tabId: tab.id, windowId: tab.windowId };
}

async function getLastFocusedTab() {
  const sourceWindow = await chrome.windows.getLastFocused({ windowTypes: ["app", "normal"] });
  if (!Number.isInteger(sourceWindow?.id)) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: sourceWindow.id });
  return tab;
}

async function getActiveTab(windowId) {
  if (Number.isInteger(windowId)) {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (!tab) throw new Error("The PWA window this Pageport window belongs to is no longer available.");
    return tab;
  }

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

function isWebPageUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function savePage({ url, title }) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only web pages can be saved.");

  const state = await readState();
  const existing = state.pages.find((page) => page.url === parsed.href);
  const now = Date.now();
  const page = existing
    ? { ...existing, title: title || existing.title, updatedAt: now }
    : {
        id: crypto.randomUUID(),
        url: parsed.href,
        title: title || parsed.hostname,
        hostname: parsed.hostname,
        origin: parsed.origin,
        folder: "General",
        pinned: false,
        createdAt: now,
        updatedAt: now,
      };

  state.pages = existing
    ? state.pages.map((item) => item.id === existing.id ? page : item)
    : [page, ...state.pages];
  await writeState(state);
  return page;
}
