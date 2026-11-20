export function normalizeWebPageUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function findSavedPageByUrl(pages, value) {
  const url = normalizeWebPageUrl(value);
  if (!url) return null;
  return pages.find((page) => page.url === url) ?? null;
}
