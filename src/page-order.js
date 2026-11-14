export function sortPagesByLastUsed(pages) {
  return [...pages].sort((left, right) => right.lastUsedAt - left.lastUsedAt);
}
