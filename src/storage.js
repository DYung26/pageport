const STORAGE_KEY = "pageport-state";

export const DEFAULT_RETENTION_SETTINGS = Object.freeze({ archiveAfterDays: 7, deleteAfterDays: 30 });
export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 365;

export const DEFAULT_STATE = {
  pages: [],
  folders: ["General"],
  collapsedOrigins: [],
  viewMode: "grouped",
  retention: DEFAULT_RETENTION_SETTINGS,
};
const MAX_FOLDER_NAME_LENGTH = 40;

export function normalizeRetentionSettings(value) {
  const archiveAfterDays = normalizeRetentionDays(value?.archiveAfterDays, DEFAULT_RETENTION_SETTINGS.archiveAfterDays);
  const deleteAfterDays = value?.deleteAfterDays === null
    ? null
    : normalizeRetentionDays(value?.deleteAfterDays, DEFAULT_RETENTION_SETTINGS.deleteAfterDays);

  return { archiveAfterDays, deleteAfterDays };
}

function normalizeRetentionDays(value, fallback) {
  return Number.isInteger(value) && value >= MIN_RETENTION_DAYS && value <= MAX_RETENTION_DAYS
    ? value
    : fallback;
}

export function normalizeFolderName(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_FOLDER_NAME_LENGTH) : "";
}

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

  const folders = ["General"];
  const folderNames = new Set(["general"]);
  for (const valueFolder of value.folders) {
    const folder = normalizeFolderName(valueFolder);
    const key = folder.toLocaleLowerCase();
    if (!folder || folderNames.has(key)) continue;
    folderNames.add(key);
    folders.push(folder);
  }
  const canonicalFolders = new Map(folders.map((folder) => [folder.toLocaleLowerCase(), folder]));

  const collapsedOrigins = [...new Set(
    (Array.isArray(value.collapsedOrigins) ? value.collapsedOrigins : []).filter(isValidOrigin),
  )];

  const pages = value.pages.filter(isValidPage).map((page) => {
    const url = new URL(page.url);
    return {
      id: page.id,
      url: url.href,
      title: page.title.slice(0, 500),
      hostname: url.hostname,
      origin: url.origin,
      folder: canonicalFolders.get(normalizeFolderName(page.folder).toLocaleLowerCase()) ?? "General",
      pinned: page.pinned === true,
      createdAt: Number.isFinite(page.createdAt) ? page.createdAt : Date.now(),
      updatedAt: Number.isFinite(page.updatedAt) ? page.updatedAt : Date.now(),
      lastUsedAt: Number.isFinite(page.lastUsedAt)
        ? page.lastUsedAt
        : Number.isFinite(page.updatedAt) ? page.updatedAt : Number.isFinite(page.createdAt) ? page.createdAt : Date.now(),
      archivedAt: Number.isFinite(page.archivedAt) ? page.archivedAt : null,
    };
  });

  return {
    pages,
    folders,
    collapsedOrigins,
    viewMode: value.viewMode === "list" ? "list" : "grouped",
    retention: normalizeRetentionSettings(value.retention),
  };
}

export function isValidOrigin(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
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
