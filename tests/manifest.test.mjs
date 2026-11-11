import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

test("configures a Manifest V3 side panel", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.side_panel.default_path, "sidepanel.html");
  assert.equal(manifest.background.type, "module");
  assert.ok(manifest.permissions.includes("sidePanel"));
});

test("declares only the required runtime permissions", () => {
  assert.deepEqual(manifest.permissions, ["storage", "tabs", "sidePanel", "contextMenus", "commands"]);
  assert.equal(manifest.host_permissions, undefined);
});

test("declares valid toolbar and save shortcuts", () => {
  assert.ok(manifest.commands._execute_action);
  assert.ok(manifest.commands["save-current-page"]);
});
