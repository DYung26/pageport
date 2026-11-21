import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRetentionPolicies,
  archiveInactivePages,
  deleteExpiredArchivedPages,
  setPageArchived,
} from "../src/archive.js";
import { DEFAULT_RETENTION_SETTINGS } from "../src/storage.js";

const now = 2_000_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ARCHIVE_AFTER_MS = DEFAULT_RETENTION_SETTINGS.archiveAfterDays * DAY_MS;

function createPage(overrides = {}) {
  return {
    id: "page-1",
    lastUsedAt: now - DEFAULT_ARCHIVE_AFTER_MS - 1,
    updatedAt: now - DEFAULT_ARCHIVE_AFTER_MS - 1,
    pinned: false,
    archivedAt: null,
    ...overrides,
  };
}

function createState(pages = [createPage()], retention = DEFAULT_RETENTION_SETTINGS) {
  return { pages, folders: ["General"], collapsedOrigins: [], retention };
}

test("defaults to a 7-day inactivity threshold and archives only after it is reached", () => {
  const recent = createPage({ lastUsedAt: now - DEFAULT_ARCHIVE_AFTER_MS + 1 });
  const due = createPage({ id: "due", lastUsedAt: now - DEFAULT_ARCHIVE_AFTER_MS });
  const older = createPage({ id: "older", lastUsedAt: now - DEFAULT_ARCHIVE_AFTER_MS - 1 });
  const state = createState([recent, due, older]);

  const archived = archiveInactivePages(state, now);

  assert.equal(archived.pages[0].archivedAt, null);
  assert.equal(archived.pages[1].archivedAt, now);
  assert.equal(archived.pages[2].archivedAt, now);
  assert.equal(state.pages[1].archivedAt, null, "the original state is not mutated");
  assert.equal(DEFAULT_RETENTION_SETTINGS.archiveAfterDays, 7);
});

test("uses the configured inactivity threshold", () => {
  const state = createState([
    createPage({ id: "recent", lastUsedAt: now - 13 * DAY_MS }),
    createPage({ id: "due", lastUsedAt: now - 14 * DAY_MS }),
  ]);

  const archived = archiveInactivePages({ ...state, retention: { archiveAfterDays: 14, deleteAfterDays: 30 } }, now);

  assert.equal(archived.pages[0].archivedAt, null);
  assert.equal(archived.pages[1].archivedAt, now);
});

test("keeps pinned and already archived pages out of automatic archiving", () => {
  const pinned = createPage({ id: "pinned", pinned: true });
  const alreadyArchived = createPage({ id: "archived", archivedAt: now - 1000 });
  const state = createState([pinned, alreadyArchived]);

  assert.equal(archiveInactivePages(state, now), state);
  assert.equal(pinned.archivedAt, null);
  assert.equal(alreadyArchived.archivedAt, now - 1000);
});

test("permanently deletes archived pages when their configured age is reached", () => {
  const expired = createPage({ id: "expired", archivedAt: now - 30 * DAY_MS });
  const recent = createPage({ id: "recent", archivedAt: now - 30 * DAY_MS + 1 });
  const active = createPage({ id: "active", archivedAt: null });
  const state = createState([expired, recent, active]);

  const retained = deleteExpiredArchivedPages(state, now, 30);

  assert.deepEqual(retained.pages, [recent, active]);
  assert.equal(state.pages.length, 3);
});

test("never deletes archived pages when deletion is explicitly disabled", () => {
  const state = createState([
    createPage({ id: "expired", archivedAt: now - 365 * DAY_MS }),
  ]);

  assert.equal(deleteExpiredArchivedPages(state, now, null), state);
});

test("applies archiving before deletion so a newly archived page is not immediately deleted", () => {
  const stale = createPage({ lastUsedAt: now - 90 * DAY_MS });
  const expiredArchive = createPage({ id: "old-archive", archivedAt: now - 2 * DAY_MS });
  const state = createState([stale, expiredArchive], { archiveAfterDays: 7, deleteAfterDays: 1 });

  const retained = applyRetentionPolicies(state, now);

  assert.equal(retained.pages.length, 1);
  assert.equal(retained.pages[0].id, "page-1");
  assert.equal(retained.pages[0].archivedAt, now);
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
