import { describe, expect, it } from "vitest";
import { barOpen, decodePage, encodeLink, encodePage, withBarOpen } from "../engine/shareLink";
import { DEFAULT_THAMBURA } from "../engine/shruthi";
import { planFor } from "../engine/thamburaPlan";
import { PageLink } from "./pageLink";

const link = (key: number) => encodeLink({ settings: { ...DEFAULT_THAMBURA, key }, custom: planFor(DEFAULT_THAMBURA), view: "studio" });
const ONE = link(3);
const TWO = link(9);

const bar = (opened: string | null) => {
  const written: string[] = [];
  return { written, address: { read: () => opened, write: (l: string) => written.push(l) } };
};

describe("PageLink", () => {
  it("hands each instrument its own part of the link the page was opened with", () => {
    const page = new PageLink(bar(encodePage([{ id: "thambura-1", link: ONE }, { id: "thambura-2", link: TWO }])).address);
    expect(page.part("thambura-1").read()).toBe(ONE);
    expect(page.part("thambura-2").read()).toBe(TWO);
    expect(page.part("thambura-3").read()).toBeNull();
  });

  it("reads an old single-thambura link as thambura-1's part", () => {
    const page = new PageLink(bar(ONE).address);
    expect(page.part("thambura-1").read()).toBe(ONE);
    expect(new PageLink(bar(null).address).part("thambura-1").read()).toBeNull();
  });

  it("writes one thambura as a plain thambura link, as before", () => {
    const { written, address } = bar(null);
    new PageLink(address).part("thambura-1").write(ONE);
    // Format 1, only the bar's bit set: what the page wrote before page links.
    expect(written).toEqual([withBarOpen(ONE, true)]);
  });

  it("writes every instrument's latest part, whichever one changed", () => {
    const { written, address } = bar(null);
    const page = new PageLink(address);
    page.part("thambura-1").write(ONE);
    page.part("thambura-2").write(TWO);
    page.part("thambura-1").write(link(5));
    const last = decodePage(written.at(-1)!)!;
    expect([...last.keys()]).toEqual(["thambura-1", "thambura-2"]);
    expect(last.get("thambura-2")).toBe(withBarOpen(TWO, true));
    expect(barOpen(last.get("thambura-1")!)).toBe(true);
  });

  it("carries the parts it was opened with until their instruments write", () => {
    const { written, address } = bar(encodePage([{ id: "thambura-1", link: ONE }, { id: "thambura-2", link: TWO }]));
    const page = new PageLink(address);
    page.part("thambura-1").write(link(5));
    expect(decodePage(written.at(-1)!)!.get("thambura-2")).toBe(withBarOpen(TWO, true));
  });

  it("marks the thambura parts with whether the bar is showing", () => {
    const { written, address } = bar(null);
    const page = new PageLink(address);
    let open = false;
    page.showsBar = () => open;
    page.part("thambura-1").write(ONE);
    open = true;
    page.part("thambura-1").write(ONE);
    expect(written.map((l) => barOpen(l))).toEqual([false, true]);
  });

  it("makes a URL for a setup, as the page link with that thambura's part swapped in", () => {
    const { address } = bar(null);
    const page = new PageLink(address, "https://thambura.com/?x=1");
    page.part("thambura-2").write(TWO);
    const url = new URL(page.url("thambura-1", ONE));
    expect(url.searchParams.get("x")).toBe("1");
    const parts = decodePage(url.searchParams.get("s")!)!;
    // Every thambura part says whether the bar is showing (here, the default: yes).
    expect(parts.get("thambura-1")).toBe(withBarOpen(ONE, true));
    expect(parts.get("thambura-2")).toBe(withBarOpen(TWO, true));
  });
});
