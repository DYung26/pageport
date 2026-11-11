import { readState, writeState } from "./storage.js";

const MENU_SAVE_PAGE = "pageport-save-page";
const MESSAGE_SAVE_ACTIVE_PAGE = "SAVE_ACTIVE_PAGE";
const MESSAGE_GET_ACTIVE_PAGE = "GET_ACTIVE_PAGE";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_SAVE_PAGE,
      title: "Save page to Pageport",
      contexts: ["page", "link"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || tab?.url;
  if (url && isWebPageUrl(url)) await savePage({ url, title: info.linkText || tab?.title });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save-current-page") return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.url && isWebPageUrl(tab.url)) await savePage({ url: tab.url, title: tab.title });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MESSAGE_SAVE_ACTIVE_PAGE) {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
      if (!tab?.url) throw new Error("The active tab has no saveable URL.");
      return savePage({ url: tab.url, title: tab.title });
    }).then((page) => sendResponse({ page })).catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === MESSAGE_GET_ACTIVE_PAGE) {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
      sendResponse({ page: tab?.url ? { url: tab.url, title: tab.title } : null });
    }).catch((error) => sendResponse({ error: error.message }));
    return true;
  }
});

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
