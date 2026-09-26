import { describe, expect, it } from "vitest";
import { storageKey } from "./storage";

describe("storageKey", () => {
  // Renaming one loses every returning listener's setup, so it has to be on purpose.
  it("keeps today's keys", () => {
    expect(storageKey("player")).toBe("thambura.player");
    expect(storageKey("drone")).toBe("thambura.drone");
    expect(storageKey("presets")).toBe("thambura.presets");
    expect(storageKey("drawer")).toBe("thambura.drawer");
  });
});
