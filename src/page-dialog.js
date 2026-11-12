export function bindPageDialog({ form, closeButton, dialog, onSave }) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSave();
  });

  closeButton.addEventListener("click", () => dialog.close());
}
