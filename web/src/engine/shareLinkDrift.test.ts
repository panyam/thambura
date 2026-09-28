import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThamburaPlan } from "./thamburaPlan";

/**
 * A Custom link is stored as edits to a built-in plan, with a checksum of
 * that plan so opening it later can say the built-in sound has changed
 * (#121). These open links against a built-in jawari plan that has changed
 * since, by mocking planFor, which is how a later release would look.
 */

type Change = (s: ThamburaPlan["strings"][number]) => ThamburaPlan["strings"][number];

/** shareLink, with the jawari plan changed by `change` (or as it is). */
async function shareLinkWith(change?: Change) {
  vi.resetModules();
  if (change) {
    vi.doMock("./thamburaPlan", async (orig) => {
      const m = await orig<typeof import("./thamburaPlan")>();
      return {
        ...m,
        planFor: (s: Parameters<typeof m.planFor>[0], c?: Parameters<typeof m.planFor>[1]) => {
          const p = m.planFor(s, c);
          return s.mode === "jawari" ? { ...p, strings: p.strings.map(change) as ThamburaPlan["strings"] } : p;
        },
      };
    });
  }
  return import("./shareLink");
}

/** A Custom link from the jawari plan with one Lab edit, made by today's encoder. */
async function customLink(): Promise<string> {
  const { encodeLink } = await shareLinkWith();
  const { planFor, FIELD_SPECS, writeField } = await import("./thamburaPlan");
  const { DEFAULT_THAMBURA } = await import("./shruthi");
  const jawari = planFor({ ...DEFAULT_THAMBURA, mode: "jawari" });
  const level = FIELD_SPECS.find((f) => f.field.key === "level")!.field;
  const custom = { ...jawari, strings: jawari.strings.map((s, i) => (i === 3 ? writeField(s, level, 0.5) : s)) as ThamburaPlan["strings"] };
  return encodeLink({ settings: { ...DEFAULT_THAMBURA, mode: "custom" }, custom, view: "studio" });
}

async function opened(link: string, change?: Change) {
  const { decodeLink } = await shareLinkWith(change);
  const { DEFAULT_THAMBURA } = await import("./shruthi");
  return decodeLink(link, { settings: DEFAULT_THAMBURA })!;
}

const longerSample: Change = (s) => ({ ...s, voice: { ...s.voice, seconds: s.voice.seconds + 3 } });
const newTailFade: Change = (s) => ({ ...s, voice: { ...s.voice, tailFade: s.voice.tailFade + 0.1 } });
const longerRing: Change = (s) => ({ ...s, voice: { ...s.voice, ringSeconds: s.voice.ringSeconds * 2 } });

afterEach(() => {
  vi.doUnmock("./thamburaPlan");
  vi.resetModules();
});

describe("the drift note", () => {
  it("doesn't show when the built-in sound hasn't changed", async () => {
    expect((await opened(await customLink())).drifted).toBe(false);
  });

  it("shows when a built-in sound's hidden values have changed (#121)", async () => {
    const link = await customLink();
    expect((await opened(link, longerSample)).drifted).toBe(true);
    expect((await opened(link, newTailFade)).drifted).toBe(true);
  });

  it("still shows when a slider value has changed", async () => {
    expect((await opened(await customLink(), longerRing)).drifted).toBe(true);
  });

  it("keeps a format 3 link's old checksum, which never covered the hidden values", async () => {
    // Made by the format 3 encoder: the jawari plan with string 4's level at 0.5.
    const format3 = "AwgDA0AHETABwjIyPDwA2OYBQAg_4AAAAAAAAAA";
    expect((await opened(format3)).drifted).toBe(false);
    expect((await opened(format3, longerSample)).drifted).toBe(false);
    expect((await opened(format3, longerRing)).drifted).toBe(true);
  });
});
