export const ARCHIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function archiveInactivePages(state, now = Date.now()) {
  let archivedCount = 0;
  const pages = state.pages.map((page) => {
    if (page.archivedAt !== null || page.pinned || now - page.lastUsedAt < ARCHIVE_AFTER_MS) return page;
    archivedCount += 1;
    return { ...page, archivedAt: now };
  });

  return archivedCount ? { ...state, pages } : state;
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
