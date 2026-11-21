import { DEFAULT_RETENTION_SETTINGS, normalizeRetentionSettings } from "./storage.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function archiveInactivePages(state, now = Date.now(), archiveAfterDays = state.retention?.archiveAfterDays ?? DEFAULT_RETENTION_SETTINGS.archiveAfterDays) {
  const archiveAfterMs = archiveAfterDays * DAY_MS;
  let archivedCount = 0;
  const pages = state.pages.map((page) => {
    if (page.archivedAt !== null || page.pinned || now - page.lastUsedAt < archiveAfterMs) return page;
    archivedCount += 1;
    return { ...page, archivedAt: now };
  });

  return archivedCount ? { ...state, pages } : state;
}

export function deleteExpiredArchivedPages(state, now = Date.now(), deleteAfterDays = state.retention?.deleteAfterDays ?? DEFAULT_RETENTION_SETTINGS.deleteAfterDays) {
  if (deleteAfterDays === null) return state;

  const expirationTime = now - deleteAfterDays * DAY_MS;
  const pages = state.pages.filter((page) => page.archivedAt === null || page.archivedAt > expirationTime);
  return pages.length === state.pages.length ? state : { ...state, pages };
}

export function applyRetentionPolicies(state, now = Date.now()) {
  const retention = normalizeRetentionSettings(state.retention);
  const archivedState = archiveInactivePages(state, now, retention.archiveAfterDays);
  return deleteExpiredArchivedPages(archivedState, now, retention.deleteAfterDays);
}

export function setPageArchived(state, pageId, archived, now = Date.now()) {
  let changed = false;
  const pages = state.pages.map((page) => {
    if (page.id !== pageId) return page;
    if (archived && page.archivedAt !== null) return page;
    if (!archived && page.archivedAt === null) return page;

    changed = true;
    return archived
      ? { ...page, archivedAt: now }
      : { ...page, archivedAt: null, lastUsedAt: now, updatedAt: now };
  });

  return changed ? { ...state, pages } : state;
}
