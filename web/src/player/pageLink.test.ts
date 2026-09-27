import { describe, expect, it } from "vitest";
import { barOpen, encodeLink } from "../engine/shareLink";
import { DEFAULT_THAMBURA } from "../engine/shruthi";
import { planFor } from "../engine/thamburaPlan";
import { PageLink } from "./pageLink";

const LINK = encodeLink({ settings: DEFAULT_THAMBURA, custom: planFor(DEFAULT_THAMBURA), view: "studio" });

describe("PageLink", () => {
  const bar = () => {
    const written: string[] = [];
    return { written, address: { read: () => LINK, write: (link: string) => written.push(link) } };
  };

  it("reads the link the page was opened with", () => {
    expect(new PageLink(bar().address).read()).toBe(LINK);
  });

  it("says the bar is showing until a layout says otherwise", () => {
    const { written, address } = bar();
    const link = new PageLink(address);
    link.write(LINK);
    let open = false;
    link.showsBar = () => open;
    link.write(LINK);
    open = true;
    link.write(LINK);
    expect(written.map((l) => barOpen(l))).toEqual([true, false, true]);
  });
});
