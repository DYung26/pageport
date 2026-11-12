import test from "node:test";
import assert from "node:assert/strict";
import { isOriginCollapsed, toggleOriginCollapsed } from "../src/origin-groups.js";

const initialState = {
  pages: [],
  folders: ["General"],
  collapsedOrigins: [],
};

test("collapses and re-expands one origin without changing other origins", () => {
  const firstOrigin = "https://example.com";
  const secondOrigin = "https://other.example";

  const firstCollapse = toggleOriginCollapsed(initialState, firstOrigin);
  assert.equal(isOriginCollapsed(firstCollapse, firstOrigin), true);
  assert.equal(isOriginCollapsed(firstCollapse, secondOrigin), false);

  const secondCollapse = toggleOriginCollapsed(firstCollapse, secondOrigin);
  assert.deepEqual(secondCollapse.collapsedOrigins, [firstOrigin, secondOrigin]);

  const reExpanded = toggleOriginCollapsed(secondCollapse, firstOrigin);
  assert.deepEqual(reExpanded.collapsedOrigins, [secondOrigin]);
  assert.equal(isOriginCollapsed(reExpanded, firstOrigin), false);
  assert.equal(isOriginCollapsed(reExpanded, secondOrigin), true);
});

test("does not mutate the original state when toggling a group", () => {
  const collapsed = toggleOriginCollapsed(initialState, "https://example.com");

  assert.deepEqual(initialState.collapsedOrigins, []);
  assert.deepEqual(collapsed.collapsedOrigins, ["https://example.com"]);
});
