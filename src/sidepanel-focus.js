export function bindHoverSearchFocus({ root, searchInput, dialogs = [] }) {
  let pointerInside = false;

  const isMouseEvent = (event) => event.pointerType === "mouse" || event.type.startsWith("mouse");

  const focusSearchOnMouseEntry = (event) => {
    if (!isMouseEvent(event) || pointerInside) return;
    pointerInside = true;
    if (dialogs.some((dialog) => dialog.open)) return;

    searchInput.focus({ preventScroll: true });
  };

  const resetPointerEntry = (event) => {
    if (!isMouseEvent(event)) return;
    pointerInside = false;
  };

  root.addEventListener("pointerenter", focusSearchOnMouseEntry);
  root.addEventListener("pointermove", focusSearchOnMouseEntry, true);
  root.addEventListener("mousemove", focusSearchOnMouseEntry, true);
  root.addEventListener("pointerleave", resetPointerEntry);
  root.addEventListener("mouseleave", resetPointerEntry);

  return () => {
    root.removeEventListener("pointerenter", focusSearchOnMouseEntry);
    root.removeEventListener("pointermove", focusSearchOnMouseEntry, true);
    root.removeEventListener("mousemove", focusSearchOnMouseEntry, true);
    root.removeEventListener("pointerleave", resetPointerEntry);
    root.removeEventListener("mouseleave", resetPointerEntry);
  };
}
