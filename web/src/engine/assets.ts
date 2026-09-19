/**
 * Sound and image groups from TalasFixtures.json. A group maps the names beats
 * use ("down", "open", "one" …) to asset URLs.
 *
 * A group listed in the fixture's RandomGroups ignores the beat's name and
 * picks one of its entries per step using the step's variant draw. The SaRiGaMa
 * group uses this to flash a random swara for each beat.
 *
 * The fixture also has Angas, Talas, TalaGroups and Defaults sections, an
 * early declarative form of the tala tables that nothing reads; carnatic.ts
 * holds the tables actually used.
 */
export interface AssetGroup {
  name: string;
  random: boolean;
  entries: Record<string, string>;
}

export interface AssetCatalog {
  soundGroups: AssetGroup[];
  imageGroups: AssetGroup[];
}

export function parseCatalog(json: unknown): AssetCatalog {
  if (!isRecord(json)) throw new Error("fixtures: expected a JSON object");
  const random = new Set(Array.isArray(json.RandomGroups) ? json.RandomGroups.map(String) : []);
  return {
    soundGroups: parseGroups(json.SoundGroups, "SoundGroups", random),
    imageGroups: parseGroups(json.ImageGroups, "ImageGroups", random),
  };
}

/**
 * The URL for `name` in the group, or null when the group has none. Groups
 * don't cover every name (Simple has no guru_* images), so null is normal.
 */
export function resolveAsset(group: AssetGroup, name: string, variant: number): string | null {
  if (group.random) {
    const keys = Object.keys(group.entries);
    if (keys.length === 0) return null;
    const i = Math.min(keys.length - 1, Math.floor(variant * keys.length));
    return group.entries[keys[i]];
  }
  return group.entries[name] ?? null;
}

export function assetUrls(group: AssetGroup): string[] {
  return [...new Set(Object.values(group.entries))];
}

function parseGroups(value: unknown, section: string, random: Set<string>): AssetGroup[] {
  if (!isRecord(value)) throw new Error(`fixtures: ${section} must be an object`);
  return Object.entries(value).map(([name, entries]) => {
    if (!isRecord(entries)) throw new Error(`fixtures: ${section}.${name} must be an object`);
    const urls: Record<string, string> = {};
    for (const [key, url] of Object.entries(entries)) {
      if (typeof url !== "string") throw new Error(`fixtures: ${section}.${name}.${key} must be a URL string`);
      urls[key] = url;
    }
    return { name, random: random.has(name), entries: urls };
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
