/**
 * The embed guide's live examples that go through `mount()` (#109). Each
 * `[data-embed-example]` element holds its spec as JSON and its slots, and
 * is mounted with itself as the root, so its slots can't be confused with
 * another example's. embed.js comes from `data-embed-base` (SiteMetadata's
 * embedBase), the way another site would load it: from thambura.com, not
 * from these docs.
 */

interface EmbedModule {
  mount(spec: unknown, opts?: { root?: ParentNode; theme?: "light" | "dark" | "auto" }): Promise<unknown[]>;
}

export async function mountExamples(doc: Document): Promise<void> {
  const examples = [...doc.querySelectorAll<HTMLElement>("[data-embed-example]")];
  const base = doc.querySelector<HTMLElement>("[data-embed-base]")?.dataset.embedBase;
  if (examples.length === 0 || !base) return;
  let embed: EmbedModule;
  try {
    embed = (await import(/* @vite-ignore */ `${base}embed.js`)) as EmbedModule;
  } catch (err) {
    for (const el of examples) el.dataset.embedError = "embed.js didn't load";
    console.warn("embed examples:", err);
    return;
  }
  // The docs' own theme when the page loaded; an embed doesn't follow a
  // change after it's mounted.
  const theme = doc.documentElement.classList.contains("dark") ? "dark" : "light";
  for (const el of examples) {
    try {
      await embed.mount(JSON.parse(el.dataset.embedExample ?? ""), { root: el, theme });
      el.dataset.embedMounted = "";
    } catch (err) {
      el.dataset.embedError = String(err);
      console.warn("embed example:", err);
    }
  }
}
