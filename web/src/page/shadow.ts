/**
 * Gives an island a shadow root to live in on someone else's page, with our
 * stylesheet inside it. The host's CSS can't reach in and ours can't leak out
 * (Tailwind's reset included). Returns the element the island mounts in.
 *
 * Inside a shadow root our dark styles can't see a `.dark` class on the
 * host's <html>, so `dark` says whether to use them; the caller decides
 * (embed.ts follows the host's colour scheme, or the host's say-so).
 */
export function shadowSlot(host: HTMLElement, stylesheet: string, dark: boolean): HTMLElement {
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = stylesheet;
  const mount = document.createElement("div");
  mount.className = dark ? "dark" : "";
  // Tailwind's reset sets the font on <html>, which a shadow root doesn't
  // have, so the island would take the host's font and size without this.
  mount.style.cssText = "font-family: ui-sans-serif, system-ui, sans-serif; font-size: 16px; line-height: 1.5;";
  const inner = document.createElement("div");
  inner.className = "text-gray-900 dark:text-gray-100";
  mount.append(inner);
  root.replaceChildren(link, mount);
  return inner;
}
