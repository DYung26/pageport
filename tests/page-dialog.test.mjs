import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bindPageDialog } from "../src/page-dialog.js";

const html = await readFile(new URL("../sidepanel.html", import.meta.url), "utf8");

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
