const BROWSER_WINDOW_TYPES = ["app", "normal"];

export async function resolveOwningWindowId(launchWindowId, windowsApi) {
  if (Number.isSafeInteger(launchWindowId) && launchWindowId >= 0) return launchWindowId;

  try {
    const currentWindow = await windowsApi.getCurrent();
    if (Number.isSafeInteger(currentWindow?.id) && currentWindow.id >= 0) return currentWindow.id;
  } catch {
    // Some extension contexts may not expose a current browser window.
  }

  const lastFocusedWindow = await windowsApi.getLastFocused({ windowTypes: BROWSER_WINDOW_TYPES });
  if (Number.isSafeInteger(lastFocusedWindow?.id) && lastFocusedWindow.id >= 0) return lastFocusedWindow.id;
  throw new Error("The browser window is unavailable.");
}
