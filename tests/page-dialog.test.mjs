import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bindPageDialog } from "../src/page-dialog.js";

const html = await readFile(new URL("../sidepanel.html", import.meta.url), "utf8");
const sidepanel = await readFile(new URL("../src/sidepanel.js", import.meta.url), "utf8");

test("configures the edit page modal as a normal submitting form", () => {
  assert.match(html, /<form id="page-form">/);
  const pageDialog = html.match(/<dialog id="page-dialog"[\s\S]*?<\/dialog>/)?.[0];
  assert.ok(pageDialog);
  assert.doesNotMatch(pageDialog, /method="dialog"/);
  assert.match(html, /id="save-page-changes" type="submit"/);
  assert.match(html, /id="close-page-dialog" type="button"/);
  assert.match(html, /id="archive-page" type="button">Archive page<\/button>/);
  assert.match(html, /id="page-name"[^>]*required/);
});

test("submitting the edit form saves changes without implicitly closing the dialog", () => {
  const form = new EventTarget();
  const closeButton = new EventTarget();
  let saveCount = 0;
  let closeCount = 0;

  bindPageDialog({
    form,
    closeButton,
    dialog: { close() { closeCount += 1; } },
    onSave() { saveCount += 1; },
  });

  const submit = new Event("submit", { cancelable: true });
  form.dispatchEvent(submit);

  assert.equal(submit.defaultPrevented, true);
  assert.equal(saveCount, 1);
  assert.equal(closeCount, 0);
});

test("the close button cancels editing without saving", () => {
  const form = new EventTarget();
  const closeButton = new EventTarget();
  let saveCount = 0;
  let closeCount = 0;

  bindPageDialog({
    form,
    closeButton,
    dialog: { close() { closeCount += 1; } },
    onSave() { saveCount += 1; },
  });

  closeButton.dispatchEvent(new Event("click"));

  assert.equal(saveCount, 0);
  assert.equal(closeCount, 1);
});

test("provides a dedicated archived-pages filter and count", () => {
  assert.match(html, /data-filter="archived" type="button">Archived <span id="archived-count">/);
});

test("shows a distinct confirmation when a page is already saved", () => {
  assert.match(sidepanel, /response\?\.alreadySaved \? "Already saved in Pageport" : "Page saved to Pageport"/);
  assert.match(sidepanel, /message\.type !== "PAGE_SAVE_RESULT"/);
  assert.match(sidepanel, /message\.alreadySaved \? "Already saved in Pageport" : "Page saved to Pageport"/);
});

test("provides an accessible grouped and list layout switch", () => {
  assert.match(html, /id="view-switch" role="group" aria-label="Page layout"/);
  assert.match(html, /data-view-mode="grouped" type="button" aria-pressed="true"/);
  assert.match(html, /data-view-mode="list" type="button" aria-pressed="false"/);
  assert.match(sidepanel, /elements\.viewSwitch\.addEventListener\("click"/);
  assert.match(sidepanel, /state\.viewMode === "list" \? pages\.map\(createPageCard\) : renderGroupedPages\(pages\)/);
  assert.match(sidepanel, /payload\.viewMode === "list" \|\| payload\.viewMode === "grouped"/);
});

test("focuses the library search when the mouse enters Pageport", () => {
  assert.match(sidepanel, /import \{ bindHoverSearchFocus \} from "\.\/sidepanel-focus\.js"/);
  assert.match(sidepanel, /bindHoverSearchFocus\(\{\s*root: document\.documentElement,\s*searchInput: elements\.search,\s*dialogs: \[elements\.folderDialog, elements\.settingsDialog, elements\.pageDialog\],\s*\}\)/);
});

test("uses the no-folder sentinel when rendering the unfiltered library title", () => {
  assert.match(sidepanel, /activeFolder === NO_FOLDER_FILTER/);
  assert.doesNotMatch(sidepanel, /\bALL_FOLDERS\b/);
});

test("provides one folder dropdown that refines the current page filter", () => {
  assert.ok(html.includes('id="filters" role="group" aria-label="Page filters">'));
  assert.ok(html.includes('id="folder-filter" aria-label="Filter pages by folder"'));
  assert.ok(html.indexOf('id="folder-filter"') > html.indexOf('data-filter="archived"'));
  assert.ok(html.indexOf('id="folder-filter"') < html.indexOf('</div>', html.indexOf('id="filters"')));
  assert.ok(html.includes('<option value="">Folder</option>'));
  assert.ok(!html.includes('id="folder-filters"'));
  assert.ok(!html.includes('All folders'));
  assert.ok(sidepanel.includes('elements.folderFilter.addEventListener("change"'));
  assert.ok(sidepanel.includes("filterPagesByFolder(matchingPages, activeFolder)"));
  assert.ok(sidepanel.includes("renderFolderFilter(matchingPages)"));
});

test("renders all starred pages in one top-level group before website groups", () => {
  assert.ok(sidepanel.includes("sortPagesForGroupedView(filteredPages)"));
  assert.ok(sidepanel.includes("renderGroupedPages(pages)"));
  assert.ok(sidepanel.includes("const starredPages = pages.filter((page) => page.pinned)"));
  assert.ok(sidepanel.includes("const regularPages = pages.filter((page) => !page.pinned)"));
  assert.ok(sidepanel.includes("renderStarredGroup(starredPages)"));
});

test("uses a native anchor so browser link actions and modifier clicks work", () => {
  assert.ok(sidepanel.includes("document.createElement(\"a\")"));
  assert.ok(sidepanel.includes("main.href = page.url"));
  assert.ok(sidepanel.includes("event.metaKey || event.ctrlKey || event.shiftKey || event.altKey"));
});

test("offers an explicit action to open the selected page in a new tab", () => {
  assert.match(html, /id=\"open-page-new-tab\" type=\"button\">Open in new tab/);
  assert.ok(sidepanel.includes("elements.openPageNewTab.addEventListener(\"click\", openActivePageInNewTab)"));
  assert.ok(sidepanel.includes("type: \"OPEN_SAVED_PAGE_NEW_TAB\""));
  assert.ok(sidepanel.includes("async function openActivePageInNewTab()"));
});

test("keeps the saved library render available when active-page lookup fails", () => {
  const refreshStart = sidepanel.indexOf("async function refreshActivePage()");
  const refreshEnd = sidepanel.indexOf("async function refreshShortcutLabels()", refreshStart);
  const refreshFunction = sidepanel.slice(refreshStart, refreshEnd);

  assert.ok(refreshFunction.includes("try {"));
  assert.ok(refreshFunction.includes("catch (error)"));
  assert.ok(refreshFunction.includes("updateActivePageSavedState()"));
  assert.ok(sidepanel.includes("elements.saveActive.disabled = !canSaveActivePage || isSaved"));
  assert.ok(sidepanel.indexOf("render();") > sidepanel.indexOf("await refreshActivePage();"));
});

test("announces the page count without making every saved page a live region", () => {
  assert.ok(html.includes('id="result-count" role="status" aria-live="polite"'));
  assert.ok(html.includes('<section class="library">'));
  assert.ok(!html.includes('<section class="library" aria-live="polite">'));
});


test("keeps startup rendering available when automatic archive persistence fails", () => {
  const startupStart = sidepanel.indexOf("const archivedState = archiveInactivePages(state)");
  const startupEnd = sidepanel.indexOf("let activeFilter =", startupStart);
  const startup = sidepanel.slice(startupStart, startupEnd);
  const archiveStart = sidepanel.indexOf("async function archiveInactivePagesIfNeeded()");
  const archiveEnd = sidepanel.indexOf("async function persist()", archiveStart);
  const archiveFunction = sidepanel.slice(archiveStart, archiveEnd);

  assert.ok(startup.includes("catch (error)"));
  assert.ok(startup.includes("startupArchiveError = error"));
  assert.ok(sidepanel.indexOf("render();") > sidepanel.indexOf("await refreshActivePage();"));
  assert.ok(archiveFunction.includes("catch (error)"));
  assert.ok(archiveFunction.includes("console.error"));
  assert.ok(archiveFunction.includes("state = nextState"));
});


test("shows the saved-page indicator and find action in the active-page capture row", () => {
  assert.ok(html.includes('id="active-page-saved"'));
  assert.ok(html.includes('id="find-saved-page"'));
  assert.ok(html.includes('id="save-active-label"'));
  assert.ok(sidepanel.includes('elements.findSavedPage.addEventListener("click", findActiveSavedPage)'));
  assert.ok(sidepanel.includes("elements.findSavedPage.hidden = !isSaved"));
  assert.ok(sidepanel.includes('elements.saveActiveLabel.textContent = isSaved ? "Saved" : "Save page"'));
});

test("highlights the current saved page card and exposes its page identity", () => {
  assert.ok(sidepanel.includes("card.dataset.pageId = page.id"));
  assert.ok(sidepanel.includes('card.classList.toggle("is-current-page", isCurrentPage)'));
  assert.ok(sidepanel.includes('card.setAttribute("aria-current", "location")'));
  assert.ok(sidepanel.includes("findSavedPageByUrl(state.pages, activePageUrl)"));
});

test("find action clears conflicting filters, opens collapsed groups, and scrolls to the target", () => {
  const start = sidepanel.indexOf("function findActiveSavedPage()");
  const end = sidepanel.indexOf("async function refreshShortcutLabels()", start);
  const findFunction = sidepanel.slice(start, end);

  assert.ok(findFunction.includes('elements.search.value = ""'));
  assert.ok(findFunction.includes("activeFolder = NO_FOLDER_FILTER"));
  assert.ok(findFunction.includes('activeFilter = page.archivedAt !== null ? "archived" : "all"'));
  assert.ok(findFunction.includes('state.viewMode !== "list"'));
  assert.ok(findFunction.includes("collapsedOrigins: state.collapsedOrigins.filter"));
  assert.ok(findFunction.includes("card.scrollIntoView"));
  assert.ok(findFunction.includes("card.focus({ preventScroll: true })"));
  assert.ok(findFunction.includes('card.classList.add("is-find-target")'));
});
