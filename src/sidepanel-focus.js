export function bindHoverSearchFocus({ root, searchInput, dialogs = [] }) {
  const handlePointerEnter = (event) => {
    if (event.pointerType !== "mouse") return;
    if (dialogs.some((dialog) => dialog.open)) return;

    searchInput.focus({ preventScroll: true });
  };

  root.addEventListener("pointerenter", handlePointerEnter);
  return () => root.removeEventListener("pointerenter", handlePointerEnter);
}
