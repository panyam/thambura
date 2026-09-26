/**
 * Sound and image groups from TalasFixtures.json. A group maps the names beats
 * use ("down", "open", "one" …) to asset URLs.
 *
 * The tala tables themselves are in carnatic.ts, not the fixture.
 * design/tala-tables-2016.json keeps an early declarative sketch of them.
 */
export interface AssetGroup {
  name: string;
  entries: Record<string, string>;
}

export interface AssetCatalog {
  soundGroups: AssetGroup[];
  imageGroups: AssetGroup[];
}

/**
 * Reads the fixtures. With `base`, the URL the fixtures came from, every asset
 * URL is resolved against it, the way a browser resolves a link in a page: a
 * relative path is relative to the fixtures file, and a path from the root
 * (the file's own "/static/...") stays on the fixtures' origin. That is what
 * lets another site's page embed the tala and still load our sounds. A
 * relative `base` is resolved against `page`, the address of the page that
 * asked; without one it can't be, and URLs are left as written.
 */
export function parseCatalog(json: unknown, base?: string, page: string | undefined = globalThis.location?.href): AssetCatalog {
  if (!isRecord(json)) throw new Error("fixtures: expected a JSON object");
  const resolve = resolverFor(base, page);
  return {
    soundGroups: parseGroups(json.SoundGroups, "SoundGroups", resolve),
    imageGroups: parseGroups(json.ImageGroups, "ImageGroups", resolve),
  };
}

function resolverFor(base: string | undefined, page: string | undefined): (url: string) => string {
  if (!base) return (url) => url;
  let from: URL;
  try {
    from = new URL(base, page);
  } catch {
    return (url) => url;
  }
  return (url) => new URL(url, from).href;
}

/**
 * The URL for `name` in the group, or null when the group has none. Groups
 * don't cover every name (Simple has no guru_* images), so null is normal.
 */
export function resolveAsset(group: AssetGroup, name: string): string | null {
  return group.entries[name] ?? null;
}

export function assetUrls(group: AssetGroup): string[] {
  return [...new Set(Object.values(group.entries))];
}

function parseGroups(value: unknown, section: string, resolve: (url: string) => string): AssetGroup[] {
  if (!isRecord(value)) throw new Error(`fixtures: ${section} must be an object`);
  return Object.entries(value).map(([name, entries]) => {
    if (!isRecord(entries)) throw new Error(`fixtures: ${section}.${name} must be an object`);
    const urls: Record<string, string> = {};
    for (const [key, url] of Object.entries(entries)) {
      if (typeof url !== "string") throw new Error(`fixtures: ${section}.${name}.${key} must be a URL string`);
      urls[key] = resolve(url);
    }
    return { name, entries: urls };
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
