export function sortPagesByLastUsed(pages) {
  return [...pages].sort((left, right) => right.lastUsedAt - left.lastUsedAt);
}

export function sortPagesForGroupedView(pages) {
  return [...pages].sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.lastUsedAt - left.lastUsedAt);
}
