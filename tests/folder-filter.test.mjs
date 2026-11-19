import test from "node:test";
import assert from "node:assert/strict";
import { ALL_FOLDERS, countPagesByFolder, filterPagesByFolder } from "../src/folder-filter.js";

const pages = [
  { id: "one", folder: "General" },
  { id: "two", folder: "Research" },
  { id: "three", folder: "Research" },
  { id: "four", folder: "Personal" },
];

test("returns every page for the all-folders view", () => {
  const result = filterPagesByFolder(pages, ALL_FOLDERS);
  assert.deepEqual(result, pages);
  assert.notEqual(result, pages);
});

test("returns only pages assigned to the selected folder", () => {
  assert.deepEqual(filterPagesByFolder(pages, "Research").map((page) => page.id), ["two", "three"]);
  assert.deepEqual(filterPagesByFolder(pages, "Missing"), []);
});

test("counts pages by folder without mutating the input", () => {
  const counts = countPagesByFolder(pages);
  assert.deepEqual([...counts], [["General", 1], ["Research", 2], ["Personal", 1]]);
  assert.equal(pages.length, 4);
});
