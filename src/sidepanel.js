import { normalizeState, readState, writeState } from "./storage.js";
import { getPageportWindowTitle } from "./window-title.js";
import { bindPageDialog } from "./page-dialog.js";
import { isOriginCollapsed, toggleOriginCollapsed } from "./origin-groups.js";
import { archiveInactivePages, setPageArchived } from "./archive.js";
import { sortPagesByLastUsed, sortPagesForGroupedView } from "./page-order.js";
import { bindHoverSearchFocus } from "./sidepanel-focus.js";
import { ALL_FOLDERS, countPagesByFolder, filterPagesByFolder } from "./folder-filter.js";

const STORAGE_KEY = "pageport-state";
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ARCHIVE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const launchWindowId = getLaunchWindowId();

const elements = {
  activePage: document.querySelector("#active-page-label"),
  saveActive: document.querySelector("#save-active"),
  search: document.querySelector("#search"),
  filters: document.querySelector("#filters"),
  folderFilters: document.querySelector("#folder-filters"),
  viewSwitch: document.querySelector("#view-switch"),
  pageList: document.querySelector("#page-list"),
  emptyState: document.querySelector("#empty-state"),
  emptyTitle: document.querySelector("#empty-title"),
  emptyCopy: document.querySelector("#empty-copy"),
  libraryTitle: document.querySelector("#library-title"),
  resultCount: document.querySelector("#result-count"),
  allCount: document.querySelector("#all-count"),
  archivedCount: document.querySelector("#archived-count"),
  folderDialog: document.querySelector("#folder-dialog"),
  folderList: document.querySelector("#folder-list"),
  folderInput: document.querySelector("#new-folder"),
  settingsDialog: document.querySelector("#settings-dialog"),
  openPageportShortcut: document.querySelector("#open-pageport-shortcut"),
  saveCurrentPageShortcut: document.querySelector("#save-current-page-shortcut"),
  shortcutStatus: document.querySelector("#shortcut-status"),
  toast: document.querySelector("#toast"),
  pageDialog: document.querySelector("#page-dialog"),
  pageForm: document.querySelector("#page-form"),
  closePageDialog: document.querySelector("#close-page-dialog"),
  pageName: document.querySelector("#page-name"),
  pageFolder: document.querySelector("#page-folder"),
  archivePage: document.querySelector("#archive-page"),
  deletePage: document.querySelector("#delete-page"),
  openPageNewTab: document.querySelector("#open-page-new-tab"),
};

bindHoverSearchFocus({
  root: document.documentElement,
  searchInput: elements.search,
  dialogs: [elements.folderDialog, elements.settingsDialog, elements.pageDialog],
});

let state = await readState();
const archivedBeforeStartup = state.pages.filter((page) => page.archivedAt !== null).length;
state = archiveInactivePages(state);
const startupArchivedCount = state.pages.filter((page) => page.archivedAt !== null).length - archivedBeforeStartup;
if (startupArchivedCount) await writeState(state);
let activeFilter = "all";
let activeFolder = ALL_FOLDERS;
let activePageId = null;
let toastTimeout;

await refreshActivePage();
void refreshShortcutLabels();
render();
if (startupArchivedCount) showToast(`${startupArchivedCount} inactive ${startupArchivedCount === 1 ? "page was" : "pages were"} moved to Archive`);
window.setInterval(() => void archiveInactivePagesIfNeeded(), ARCHIVE_CHECK_INTERVAL_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void archiveInactivePagesIfNeeded();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "PAGE_SAVE_RESULT") return;
  showToast(message.alreadySaved ? "Already saved in Pageport" : "Page saved to Pageport");
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY]) return;
  state = normalizeState(changes[STORAGE_KEY].newValue);
  if (activeFolder !== ALL_FOLDERS && !state.folders.includes(activeFolder)) activeFolder = ALL_FOLDERS;
  render();
});

chrome.tabs.onActivated.addListener(() => {
  void refreshActivePage();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.title) void refreshActivePage();
});

elements.saveActive.addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "SAVE_ACTIVE_PAGE", windowId: launchWindowId ?? undefined });
    if (response?.error) return showToast(response.error);
    showToast(response?.alreadySaved ? "Already saved in Pageport" : "Page saved to Pageport");
  } catch (error) {
    showToast(`Couldn't save this page: ${error.message}`);
  }
});

elements.search.addEventListener("input", render);
elements.filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter;
  elements.filters.querySelectorAll(".filter").forEach((filter) => filter.classList.toggle("active", filter === button));
  render();
});

elements.folderFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-folder-filter]");
  if (!button) return;
  activeFolder = button.dataset.folderFilter;
  render();
});

elements.viewSwitch.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-view-mode]");
  if (!button) return;
  const viewMode = button.dataset.viewMode;
  if ((viewMode !== "grouped" && viewMode !== "list") || viewMode === state.viewMode) return;
  state = { ...state, viewMode };
  await persist();
});

document.querySelector("#manage-folders").addEventListener("click", () => {
  renderFolders();
  elements.folderDialog.showModal();
});

document.querySelector("#settings-button").addEventListener("click", () => elements.settingsDialog.showModal());
document.querySelector("#add-folder").addEventListener("click", addFolder);
elements.folderInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addFolder();
});
bindPageDialog({
  form: elements.pageForm,
  closeButton: elements.closePageDialog,
  dialog: elements.pageDialog,
  onSave: savePageChanges,
});
elements.archivePage.addEventListener("click", toggleArchiveActivePage);
elements.deletePage.addEventListener("click", removeActivePage);
elements.openPageNewTab.addEventListener("click", openActivePageInNewTab);
document.querySelector("#export-data").addEventListener("click", exportBackup);
document.querySelector("#import-data").addEventListener("change", importBackup);

document.addEventListener("keydown", (event) => {
  if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
  event.preventDefault();
  elements.search.focus();
});

async function refreshActivePage() {
  const response = await chrome.runtime.sendMessage({ type: "GET_ACTIVE_PAGE", windowId: launchWindowId ?? undefined });
  const page = response?.page;
  if (launchWindowId !== null) document.title = getPageportWindowTitle(page);
  const canSave = Boolean(page?.url && ["http:", "https:"].includes(new URL(page.url).protocol));
  if (canSave) {
    elements.activePage.textContent = page.title;
  } else if (launchWindowId !== null && response?.error) {
    elements.activePage.textContent = "The PWA window is no longer available";
  } else {
    elements.activePage.textContent = "This browser page cannot be saved";
  }
  elements.saveActive.disabled = !canSave;
}

async function refreshShortcutLabels() {
  let commands;
  try {
    commands = await chrome.commands.getAll();
  } catch {
    elements.openPageportShortcut.textContent = "Unavailable";
    elements.saveCurrentPageShortcut.textContent = "Unavailable";
    elements.shortcutStatus.hidden = false;
    elements.shortcutStatus.textContent = "Shortcut assignments could not be read from this browser.";
    return;
  }
  const shortcuts = new Map(commands.map((command) => [command.name, command.shortcut]));
  const openShortcut = shortcuts.get("open-pageport");
  const saveShortcut = shortcuts.get("save-current-page");

  elements.openPageportShortcut.textContent = openShortcut || "Not assigned";
  elements.saveCurrentPageShortcut.textContent = saveShortcut || "Not assigned";
  const missingShortcuts = [
    !openShortcut && "Open Pageport",
    !saveShortcut && "Save current page",
  ].filter(Boolean);
  elements.shortcutStatus.hidden = missingShortcuts.length === 0;
  elements.shortcutStatus.textContent = missingShortcuts.length
    ? `${missingShortcuts.join(" and ")} ${missingShortcuts.length === 1 ? "is" : "are"} not assigned. Choose a free key combination in your browser’s extension shortcut settings.`
    : "";
}

function render() {
  const query = elements.search.value.trim().toLocaleLowerCase();
  const archivedPages = state.pages.filter((page) => page.archivedAt !== null);
  const activePages = state.pages.filter((page) => page.archivedAt === null);
  const pagePool = activeFilter === "archived" ? archivedPages : activePages;
  const matchingPages = pagePool.filter((page) => {
    if (activeFilter === "pinned" && !page.pinned) return false;
    if (activeFilter === "recent" && Date.now() - page.lastUsedAt > RECENT_WINDOW_MS) return false;
    return `${page.title} ${page.hostname} ${page.url} ${page.folder}`.toLocaleLowerCase().includes(query);
  });
  const filteredPages = filterPagesByFolder(matchingPages, activeFolder);
  const pages = state.viewMode === "list" ? sortPagesByLastUsed(filteredPages) : sortPagesForGroupedView(filteredPages);

  elements.allCount.textContent = activePages.length;
  elements.archivedCount.textContent = archivedPages.length;
  elements.resultCount.textContent = `${pages.length} ${pages.length === 1 ? "PAGE" : "PAGES"}`;
  elements.viewSwitch.querySelectorAll("[data-view-mode]").forEach((button) => {
    const active = button.dataset.viewMode === state.viewMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderFolderFilters(matchingPages);
  elements.pageList.classList.toggle("is-flat", state.viewMode === "list");
  const filterTitle = activeFilter === "pinned" ? "Pinned pages"
    : activeFilter === "recent" ? "Recently opened"
      : activeFilter === "archived" ? "Archived pages" : "Your pages";
  elements.libraryTitle.textContent = activeFolder === ALL_FOLDERS
    ? filterTitle
    : activeFilter === "all" ? `${activeFolder} pages` : `${filterTitle} · ${activeFolder}`;
  elements.pageList.replaceChildren(...(state.viewMode === "list" ? pages.map(createPageCard) : renderGroupedPages(pages)));
  elements.emptyState.hidden = pages.length > 0;
  elements.emptyTitle.textContent = getEmptyTitle(query);
  elements.emptyCopy.textContent = getEmptyCopy(query);
}

function renderFolderFilters(pages) {
  const counts = countPagesByFolder(pages);
  const folders = [
    { name: "All folders", value: ALL_FOLDERS, count: pages.length },
    ...state.folders.map((folder) => ({ name: folder, value: folder, count: counts.get(folder) ?? 0 })),
  ];

  elements.folderFilters.replaceChildren(...folders.map(({ name, value, count }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "folder-filter";
    button.classList.toggle("active", value === activeFolder);
    button.dataset.folderFilter = value;
    button.setAttribute("aria-pressed", String(value === activeFolder));

    const label = document.createElement("span");
    label.textContent = name;
    const total = document.createElement("span");
    total.className = "folder-filter-count";
    total.textContent = count;
    button.append(label, total);
    return button;
  }));
}

function getEmptyTitle(query) {
  if (query) return "No matching pages";
  if (activeFolder !== ALL_FOLDERS) {
    const filterName = activeFilter === "pinned" ? "pinned" : activeFilter === "recent" ? "recent" : activeFilter === "archived" ? "archived" : "";
    return filterName ? `No ${filterName} pages in ${activeFolder}` : `No pages in ${activeFolder}`;
  }
  return activeFilter === "archived" ? "No archived pages"
    : activeFilter === "pinned" ? "No pinned pages"
      : activeFilter === "recent" ? "No recent pages"
        : state.pages.length ? "All pages are archived" : "Nothing saved yet";
}

function getEmptyCopy(query) {
  if (query) return "Try another search or clear your query.";
  if (activeFolder !== ALL_FOLDERS) return "Assign pages to this folder from a page’s options.";
  return activeFilter === "archived" ? "Pages you archive or leave unused for 30 days will appear here."
    : activeFilter === "pinned" ? "Pin a page from its page options to keep it easy to find."
      : activeFilter === "recent" ? "Pages used in the last 7 days appear here."
        : state.pages.length ? "Your saved pages are safe in Archive. Restore one to bring it back here."
          : "Save this page or use the context menu on any link to build your shortcuts.";
}

function renderGroupedPages(pages) {
  const starredPages = pages.filter((page) => page.pinned);
  const regularPages = pages.filter((page) => !page.pinned);
  return [
    ...(starredPages.length ? [renderStarredGroup(starredPages)] : []),
    ...renderOriginGroups(regularPages),
  ];
}

function renderStarredGroup(pages) {
  const group = document.createElement("section");
  group.className = "origin-group starred-group";

  const heading = document.createElement("div");
  heading.className = "starred-heading";
  const title = document.createElement("span");
  title.textContent = "Starred";
  const count = document.createElement("span");
  count.className = "origin-count";
  count.textContent = `${pages.length} ${pages.length === 1 ? "page" : "pages"}`;
  heading.append(title, count);

  const content = document.createElement("div");
  content.className = "origin-pages";
  content.append(...pages.map(createPageCard));
  group.append(heading, content);
  return group;
}

function renderOriginGroups(pages) {
  const groups = Map.groupBy(pages, (page) => page.origin);
  return [...groups].map(([origin, groupPages], index) => {
    const group = document.createElement("section");
    group.className = "origin-group";

    const collapsed = isOriginCollapsed(state, origin);
    const heading = document.createElement("div");
    heading.className = "origin-heading";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "origin-toggle";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-controls", `origin-pages-${index}`);
    toggle.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${origin}`);
    toggle.title = `${collapsed ? "Expand" : "Collapse"} ${origin}`;

    const name = document.createElement("span");
    name.className = "origin-name";
    name.textContent = origin;
    const count = document.createElement("span");
    count.className = "origin-count";
    count.textContent = `${groupPages.length} ${groupPages.length === 1 ? "page" : "pages"}`;
    const chevron = document.createElement("span");
    chevron.className = "origin-chevron";
    chevron.setAttribute("aria-hidden", "true");

    toggle.append(name, count, chevron);
    toggle.addEventListener("click", async () => {
      state = toggleOriginCollapsed(state, origin);
      await persist();
    });

    const content = document.createElement("div");
    content.className = "origin-pages";
    content.id = `origin-pages-${index}`;
    content.hidden = collapsed;
    content.append(...groupPages.map(createPageCard));

    heading.append(toggle);
    group.append(heading, content);
    return group;
  });
}

function createPageCard(page) {
  const card = document.createElement("article");
  card.className = "page-card";
  card.classList.toggle("is-archived", page.archivedAt !== null);

  const icon = document.createElement("div");
  icon.className = "site-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = page.hostname.slice(0, 1).toUpperCase();

  const main = document.createElement("a");
  main.className = "page-main";
  main.href = page.url;
  main.setAttribute("aria-label", `Open ${page.title}`);
  const title = document.createElement("span");
  title.className = "page-title";
  title.textContent = page.title || page.hostname;
  const domain = document.createElement("span");
  domain.className = "page-domain";
  domain.textContent = `${formatPath(page.url)} · ${page.folder}${page.archivedAt !== null ? " · Archived" : ""}`;
  main.append(title, domain);
  main.addEventListener("click", (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      void markPageUsed(page);
      return;
    }
    event.preventDefault();
    void navigateTo(page);
  });

  const actions = document.createElement("div");
  actions.className = "page-actions";
  actions.append(
    createAction(page.pinned ? "★" : "☆", page.pinned ? "Unpin page" : "Pin page", () => togglePinned(page), page.pinned ? "pinned" : ""),
    createAction("···", "Page options", () => openPageDialog(page)),
  );

  card.append(icon, main, actions);
  return card;
}

function createAction(label, description, action, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `page-action ${className}`.trim();
  button.textContent = label;
  button.title = description;
  button.setAttribute("aria-label", description);
  button.addEventListener("click", action);
  return button;
}

async function navigateTo(page) {
  try {
    const url = new URL(page.url);
    if (!["http:", "https:"].includes(url.protocol)) return showToast("This saved address cannot be opened.");
    const response = await chrome.runtime.sendMessage({
      type: "OPEN_SAVED_PAGE",
      url: url.href,
      windowId: launchWindowId ?? undefined,
    });
    if (response?.error) return showToast(response.error);
    await refreshActivePage();
    await markPageUsed(page);
  } catch (error) {
    showToast(`Couldn't open this page: ${error.message}`);
  }
}

async function markPageUsed(page) {
  const now = Date.now();
  state.pages = state.pages.map((item) => item.id === page.id
    ? { ...item, updatedAt: now, lastUsedAt: now, archivedAt: null }
    : item);
  await persist();
}

async function openActivePageInNewTab() {
  const page = state.pages.find((item) => item.id === activePageId);
  if (!page) return elements.pageDialog.close();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "OPEN_SAVED_PAGE_NEW_TAB",
      url: page.url,
      windowId: launchWindowId ?? undefined,
    });
    if (response?.error) return showToast(response.error);
    await markPageUsed(page);
    elements.pageDialog.close();
    showToast("Opened in new tab");
  } catch (error) {
    showToast(`Could not open this page in a new tab: ${error.message}`);
  }
}

async function togglePinned(page) {
  state.pages = state.pages.map((item) => item.id === page.id ? { ...item, pinned: !item.pinned } : item);
  await persist();
}

function openPageDialog(page) {
  activePageId = page.id;
  elements.pageName.value = page.title;
  elements.pageFolder.replaceChildren(...state.folders.map((folder) => {
    const option = document.createElement("option");
    option.value = folder;
    option.textContent = folder;
    option.selected = folder === page.folder;
    return option;
  }));
  elements.archivePage.textContent = page.archivedAt === null ? "Archive page" : "Restore page";
  elements.pageDialog.showModal();
}

async function toggleArchiveActivePage() {
  const page = state.pages.find((item) => item.id === activePageId);
  if (!page) return elements.pageDialog.close();
  const wasArchived = page.archivedAt !== null;
  state = setPageArchived(state, activePageId, !wasArchived);
  await persist();
  elements.pageDialog.close();
  showToast(wasArchived ? "Page restored" : "Page archived");
}

async function savePageChanges() {
  const title = elements.pageName.value.trim();
  const folder = elements.pageFolder.value;
  if (!title) return showToast("Enter a page name.");
  state.pages = state.pages.map((page) => page.id === activePageId ? { ...page, title: title.slice(0, 500), folder } : page);
  await persist();
  elements.pageDialog.close();
}

async function removeActivePage() {
  const page = state.pages.find((item) => item.id === activePageId);
  if (!page) return elements.pageDialog.close();
  if (!window.confirm(`Delete “${page.title}” from Pageport?`)) return;
  state.pages = state.pages.filter((item) => item.id !== activePageId);
  await persist();
  elements.pageDialog.close();
  showToast("Page removed");
}

async function addFolder() {
  const folder = elements.folderInput.value.trim();
  if (!folder) return;
  if (state.folders.some((item) => item.toLocaleLowerCase() === folder.toLocaleLowerCase())) return showToast("That folder already exists.");
  state.folders = [...state.folders, folder.slice(0, 40)];
  elements.folderInput.value = "";
  await persist();
  renderFolders();
}

function renderFolders() {
  elements.folderList.replaceChildren(...state.folders.map((folder) => {
    const row = document.createElement("div");
    row.className = "folder-item";
    const name = document.createElement("span");
    name.textContent = `${folder} · ${state.pages.filter((page) => page.folder === folder).length}`;
    row.append(name);
    if (folder !== "General") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => removeFolder(folder));
      row.append(remove);
    }
    return row;
  }));
}

async function removeFolder(folder) {
  state.pages = state.pages.map((page) => page.folder === folder ? { ...page, folder: "General" } : page);
  state.folders = state.folders.filter((item) => item !== folder);
  if (activeFolder === folder) activeFolder = ALL_FOLDERS;
  await persist();
  renderFolders();
}

async function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pageport-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Backup exported");
}

async function importBackup(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (!payload || !Array.isArray(payload.pages) || !Array.isArray(payload.folders)) throw new Error("Backup format is invalid.");
    const imported = normalizeState(payload);
    const merged = new Map(state.pages.map((page) => [page.url, page]));
    imported.pages.forEach((page) => merged.set(page.url, { ...merged.get(page.url), ...page }));
    const importedViewMode = payload.viewMode === "list" || payload.viewMode === "grouped"
      ? payload.viewMode
      : state.viewMode;
    state = normalizeState({
      pages: [...merged.values()],
      folders: [...state.folders, ...imported.folders],
      collapsedOrigins: [...new Set([...state.collapsedOrigins, ...imported.collapsedOrigins])],
      viewMode: importedViewMode,
    });
    await persist();
    showToast("Backup imported");
  } catch (error) {
    showToast(`Import failed: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

async function archiveInactivePagesIfNeeded() {
  const nextState = archiveInactivePages(state);
  if (nextState === state) return;
  const archivedCount = nextState.pages.filter((page) => page.archivedAt !== null).length
    - state.pages.filter((page) => page.archivedAt !== null).length;
  state = nextState;
  await persist();
  showToast(`${archivedCount} inactive ${archivedCount === 1 ? "page was" : "pages were"} moved to Archive`);
}

async function persist() {
  await writeState(state);
  render();
}

function formatPath(value) {
  const url = new URL(value);
  return `${url.pathname}${url.search}${url.hash}` || "/";
}

function showToast(message) {
  window.clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function isEditable(element) {
  return element instanceof HTMLElement && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName));
}

function getLaunchWindowId() {
  const value = new URLSearchParams(window.location.search).get("sourceWindowId");
  if (value === null || value.trim() === "") return null;
  const windowId = Number(value);
  return Number.isSafeInteger(windowId) && windowId >= 0 ? windowId : null;
}
