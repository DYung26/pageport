import { normalizeState, readState, writeState } from "./storage.js";
import { getPageportWindowTitle } from "./window-title.js";
import { bindPageDialog } from "./page-dialog.js";
import { isOriginCollapsed, toggleOriginCollapsed } from "./origin-groups.js";
import { archiveInactivePages, setPageArchived } from "./archive.js";

const STORAGE_KEY = "pageport-state";
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ARCHIVE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const launchWindowId = getLaunchWindowId();

const elements = {
  activePage: document.querySelector("#active-page-label"),
  saveActive: document.querySelector("#save-active"),
  search: document.querySelector("#search"),
  filters: document.querySelector("#filters"),
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
};

let state = await readState();
const archivedBeforeStartup = state.pages.filter((page) => page.archivedAt !== null).length;
state = archiveInactivePages(state);
const startupArchivedCount = state.pages.filter((page) => page.archivedAt !== null).length - archivedBeforeStartup;
if (startupArchivedCount) await writeState(state);
let activeFilter = "all";
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
  const pages = sortPages(pagePool).filter((page) => {
    if (activeFilter === "pinned" && !page.pinned) return false;
    if (activeFilter === "recent" && Date.now() - page.lastUsedAt > RECENT_WINDOW_MS) return false;
    return `${page.title} ${page.hostname} ${page.url} ${page.folder}`.toLocaleLowerCase().includes(query);
  });

  elements.allCount.textContent = activePages.length;
  elements.archivedCount.textContent = archivedPages.length;
  elements.resultCount.textContent = `${pages.length} ${pages.length === 1 ? "PAGE" : "PAGES"}`;
  elements.libraryTitle.textContent = activeFilter === "pinned" ? "Pinned pages"
    : activeFilter === "recent" ? "Recently opened"
      : activeFilter === "archived" ? "Archived pages" : "Your pages";
  elements.pageList.replaceChildren(...renderOriginGroups(pages));
  elements.emptyState.hidden = pages.length > 0;
  elements.emptyTitle.textContent = query ? "No matching pages"
    : activeFilter === "archived" ? "No archived pages"
      : activeFilter === "pinned" ? "No pinned pages"
        : activeFilter === "recent" ? "No recent pages"
          : state.pages.length ? "All pages are archived" : "Nothing saved yet";
  elements.emptyCopy.textContent = query ? "Try another search or clear your query."
    : activeFilter === "archived" ? "Pages you archive or leave unused for 30 days will appear here."
      : activeFilter === "pinned" ? "Pin a page from its page options to keep it easy to find."
        : activeFilter === "recent" ? "Pages used in the last 7 days appear here."
          : state.pages.length ? "Your saved pages are safe in Archive. Restore one to bring it back here."
            : "Save this page or use the context menu on any link to build your shortcuts.";
}

function sortPages(pages) {
  return [...pages].sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.lastUsedAt - left.lastUsedAt);
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

  const main = document.createElement("div");
  main.className = "page-main";
  main.tabIndex = 0;
  main.setAttribute("role", "link");
  main.setAttribute("aria-label", `Open ${page.title}`);
  const title = document.createElement("span");
  title.className = "page-title";
  title.textContent = page.title || page.hostname;
  const domain = document.createElement("span");
  domain.className = "page-domain";
  domain.textContent = `${formatPath(page.url)} · ${page.folder}${page.archivedAt !== null ? " · Archived" : ""}`;
  main.append(title, domain);
  main.addEventListener("click", () => navigateTo(page));
  main.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    navigateTo(page);
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
    const now = Date.now();
    state.pages = state.pages.map((item) => item.id === page.id
      ? { ...item, updatedAt: now, lastUsedAt: now, archivedAt: null }
      : item);
    await persist();
  } catch (error) {
    showToast(`Couldn't open this page: ${error.message}`);
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
    state = normalizeState({
      pages: [...merged.values()],
      folders: [...state.folders, ...imported.folders],
      collapsedOrigins: [...new Set([...state.collapsedOrigins, ...imported.collapsedOrigins])],
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
