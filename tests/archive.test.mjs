import test from "node:test";
import assert from "node:assert/strict";
import { ARCHIVE_AFTER_MS, archiveInactivePages, setPageArchived } from "../src/archive.js";

const now = 2_000_000_000_000;

function createPage(overrides = {}) {
  return {
    id: "page-1",
    lastUsedAt: now - ARCHIVE_AFTER_MS - 1,
    updatedAt: now - ARCHIVE_AFTER_MS - 1,
    pinned: false,
    archivedAt: null,
    ...overrides,
  };
}

function createState(pages = [createPage()]) {
  return { pages, folders: ["General"], collapsedOrigins: [] };
}

test("uses a 30-day inactivity threshold and archives only after it is reached", () => {
  const recent = createPage({ lastUsedAt: now - ARCHIVE_AFTER_MS + 1 });
  const due = createPage({ id: "due", lastUsedAt: now - ARCHIVE_AFTER_MS });
  const older = createPage({ id: "older", lastUsedAt: now - ARCHIVE_AFTER_MS - 1 });
  const state = createState([recent, due, older]);

  const archived = archiveInactivePages(state, now);

  assert.equal(archived.pages[0].archivedAt, null);
  assert.equal(archived.pages[1].archivedAt, now);
  assert.equal(archived.pages[2].archivedAt, now);
  assert.equal(state.pages[1].archivedAt, null, "the original state is not mutated");
  assert.equal(ARCHIVE_AFTER_MS, 30 * 24 * 60 * 60 * 1000);
});

test("keeps pinned and already archived pages out of automatic archiving", () => {
  const pinned = createPage({ id: "pinned", pinned: true });
  const alreadyArchived = createPage({ id: "archived", archivedAt: now - 1000 });
  const state = createState([pinned, alreadyArchived]);

  assert.equal(archiveInactivePages(state, now), state);
  assert.equal(pinned.archivedAt, null);
  assert.equal(alreadyArchived.archivedAt, now - 1000);
});

test("manual archiving includes pinned pages and restoring resets inactivity", () => {
  const page = createPage({ pinned: true });
  const state = createState([page]);

  const archived = setPageArchived(state, page.id, true, now);
  assert.equal(archived.pages[0].archivedAt, now);
  assert.equal(archived.pages[0].lastUsedAt, page.lastUsedAt);
  assert.equal(page.archivedAt, null);

  const restored = setPageArchived(archived, page.id, false, now + 500);
  assert.equal(restored.pages[0].archivedAt, null);
  assert.equal(restored.pages[0].lastUsedAt, now + 500);
  assert.equal(restored.pages[0].updatedAt, now + 500);
});

test("leaves state unchanged when the requested archive state already applies", () => {
  const state = createState([createPage()]);
  assert.equal(setPageArchived(state, "page-1", false, now), state);
  assert.equal(setPageArchived(state, "missing", true, now), state);
});
