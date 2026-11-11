import { readState, writeState } from "./storage.js";

const MENU_OPEN_PAGEPORT = "pageport-open-pageport";
const MENU_SAVE_PAGE = "pageport-save-page";
const MESSAGE_SAVE_ACTIVE_PAGE = "SAVE_ACTIVE_PAGE";
const MESSAGE_GET_ACTIVE_PAGE = "GET_ACTIVE_PAGE";

chrome.runtime.onInstalled.addListener(() => {
  // Route clicks ourselves so app windows can use a standalone extension window.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_OPEN_PAGEPORT,
      title: "Open Pageport",
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

  const url = info.linkUrl || tab?.url;
  if (url && isWebPageUrl(url)) await savePage({ url, title: info.linkText || tab?.title });
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (command === "open-pageport") {
    try {
      await openPageport(tab);
    } catch (error) {
      console.error("Couldn't open Pageport:", error);
    }
    return;
  }

  if (command === "save-current-page" && tab?.url && isWebPageUrl(tab.url)) {
    await savePage({ url: tab.url, title: tab.title });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MESSAGE_SAVE_ACTIVE_PAGE) {
    getActiveTab(message.tabId).then((tab) => {
      if (!tab?.url) throw new Error("The active tab has no saveable URL.");
      return savePage({ url: tab.url, title: tab.title });
    }).then((page) => sendResponse({ page })).catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === MESSAGE_GET_ACTIVE_PAGE) {
    getActiveTab(message.tabId).then((tab) => {
      sendResponse({
        page: tab?.url ? { url: tab.url, title: tab.title } : null,
        tabId: tab?.id ?? null,
      });
    }).catch((error) => sendResponse({ page: null, tabId: null, error: error.message }));
    return true;
  }
});

async function openPageport(tab) {
  if (!Number.isInteger(tab?.windowId)) return;

  const sourceWindow = await chrome.windows.get(tab.windowId);
  if (sourceWindow.type === "app") {
    await openPageportWindow(tab);
    return;
  }

  await chrome.sidePanel.open({ windowId: tab.windowId });
}

async function openPageportWindow(sourceTab) {
  const pageUrl = new URL(chrome.runtime.getURL("sidepanel.html"));
  pageUrl.searchParams.set("tabId", String(sourceTab.id));
  const popupUrl = pageUrl.toString();
  const pagePattern = `${chrome.runtime.getURL("sidepanel.html")}*`;
  const existingTabs = await chrome.tabs.query({ url: pagePattern });
  const existingTab = existingTabs.find((tab) => tab.url === popupUrl) ?? existingTabs[0];

  if (existingTab?.id !== undefined && existingTab.windowId !== undefined) {
    if (existingTab.url !== popupUrl) {
      await chrome.tabs.update(existingTab.id, { url: popupUrl, active: true });
    }
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

async function getActiveTab(tabId) {
  if (Number.isInteger(tabId)) return chrome.tabs.get(tabId);
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
