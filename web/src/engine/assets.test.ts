import { describe, expect, it } from "vitest";
import { parseCatalog } from "./assets";

const FIXTURES = {
  SoundGroups: { Clap: { down: "/static/Resources/Sounds/Clap/high1.wav", open: "Sounds/Clap/low1.wav" } },
  ImageGroups: { Simple: { down: "https://cdn.example/down.gif" } },
};

describe("parseCatalog with the fixtures' own URL", () => {
  it("resolves each asset against the file that names it, so another site's page loads ours", () => {
    const c = parseCatalog(FIXTURES, "https://thambura.com/static/Resources/TalasFixtures.json");
    expect(c.soundGroups[0].entries).toEqual({
      // A path from the root stays on the fixtures' origin, not the host page's.
      down: "https://thambura.com/static/Resources/Sounds/Clap/high1.wav",
      // A relative path is relative to the fixtures file.
      open: "https://thambura.com/static/Resources/Sounds/Clap/low1.wav",
    });
    expect(c.imageGroups[0].entries.down).toBe("https://cdn.example/down.gif");
  });

  it("leaves URLs as written when there's no base, as on our own pages", () => {
    expect(parseCatalog(FIXTURES).soundGroups[0].entries.down).toBe("/static/Resources/Sounds/Clap/high1.wav");
  });

  it("resolves against a relative fixtures URL using the page's address", () => {
    const c = parseCatalog(FIXTURES, "/static/Resources/TalasFixtures.json", "http://localhost:8000/labs/x");
    expect(c.soundGroups[0].entries.open).toBe("http://localhost:8000/static/Resources/Sounds/Clap/low1.wav");
  });
});
