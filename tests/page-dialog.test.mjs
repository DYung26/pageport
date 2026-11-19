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

test("provides a visible folder navigation control in the library", () => {
  assert.ok(html.includes("id=\"folder-filters\" role=\"group\" aria-label=\"Filter by folder\""));
  assert.ok(sidepanel.includes("elements.folderFilters.addEventListener(\"click\""));
  assert.ok(sidepanel.includes("filterPagesByFolder(matchingPages, activeFolder)"));
  assert.ok(sidepanel.includes("renderFolderFilters(matchingPages)"));
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
