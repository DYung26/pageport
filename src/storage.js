const STORAGE_KEY = "pageport-state";

export const DEFAULT_STATE = { pages: [], folders: ["General"] };

export async function readState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeState(stored[STORAGE_KEY]);
}

export async function writeState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeState(state) });
}

export function normalizeState(value) {
  if (!value || !Array.isArray(value.pages) || !Array.isArray(value.folders)) {
    return structuredClone(DEFAULT_STATE);
  }

  const folders = [...new Set(value.folders
    .filter((folder) => typeof folder === "string" && folder.trim())
    .map((folder) => folder.trim().slice(0, 40)))];
  if (!folders.includes("General")) folders.unshift("General");

  const pages = value.pages.filter(isValidPage).map((page) => {
    const url = new URL(page.url);
    return {
      id: page.id,
      url: url.href,
      title: page.title.slice(0, 500),
      hostname: url.hostname,
      origin: url.origin,
      folder: folders.includes(page.folder) ? page.folder : "General",
      pinned: page.pinned === true,
      createdAt: Number.isFinite(page.createdAt) ? page.createdAt : Date.now(),
      updatedAt: Number.isFinite(page.updatedAt) ? page.updatedAt : Date.now(),
    };
  });

  return { pages, folders };
}

export function isValidPage(page) {
  if (!page || typeof page !== "object" || typeof page.id !== "string" || typeof page.url !== "string" || typeof page.title !== "string") return false;
  try {
    const url = new URL(page.url);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}
