export const ALL_FOLDERS = "all";

export function filterPagesByFolder(pages, folder) {
  return folder === ALL_FOLDERS ? [...pages] : pages.filter((page) => page.folder === folder);
}

export function countPagesByFolder(pages) {
  const counts = new Map();
  for (const page of pages) counts.set(page.folder, (counts.get(page.folder) ?? 0) + 1);
  return counts;
}
