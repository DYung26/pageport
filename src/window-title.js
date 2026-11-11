export function getPageportWindowTitle(page) {
  const title = typeof page?.title === "string" ? page.title.replace(/\s+/g, " ").trim() : "";
  if (title) return `Pageport — ${title}`;

  try {
    const hostname = new URL(page?.url).hostname;
    return hostname ? `Pageport — ${hostname}` : "Pageport";
  } catch {
    return "Pageport";
  }
}
