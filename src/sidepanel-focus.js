export function bindHoverSearchFocus({ root, searchInput, dialogs = [] }) {
  let pointerInside = false;

  const focusSearchOnMouseEntry = (event) => {
    if (event.pointerType !== "mouse" || pointerInside) return;
    pointerInside = true;
    if (dialogs.some((dialog) => dialog.open)) return;

    searchInput.focus({ preventScroll: true });
  };

  const resetPointerEntry = (event) => {
    if (event.pointerType !== "mouse") return;
    pointerInside = false;
  };

  root.addEventListener("pointerenter", focusSearchOnMouseEntry);
  root.addEventListener("pointermove", focusSearchOnMouseEntry, true);
  root.addEventListener("pointerleave", resetPointerEntry);

  return () => {
    root.removeEventListener("pointerenter", focusSearchOnMouseEntry);
    root.removeEventListener("pointermove", focusSearchOnMouseEntry, true);
    root.removeEventListener("pointerleave", resetPointerEntry);
  };
}
