import { withBarOpen } from "../engine/shareLink";

/** The query parameter that carries a shared setup (engine/shareLink.ts). */
export const LINK_PARAM = "s";
// Address bar updates wait for this long after the last change: Safari throws
// if replaceState is called more than 100 times in 30 s, and a slider drag
// changes the setup on every step.
const LINK_SETTLE_MS = 400;

/** Where the page's share link lives: the address bar, or a fake in tests. */
export interface AddressBar {
  /** The link the page was opened with, if any. */
  read(): string | null;
  /** Shows `link` as the current one. */
  write(link: string): void;
}

/**
 * The page's share link. Instruments write their setup through it, and the
 * layout adds whether the thambura's bar is showing, which the instrument
 * doesn't know: `showsBar` is true (a docked thambura is always in view)
 * until a drawer layout replaces it with its own open state.
 * TODO(#100b): carry every instrument on the page, not only the thambura.
 */
export class PageLink {
  showsBar: () => boolean = () => true;

  constructor(private readonly address: AddressBar) {}

  read(): string | null {
    return this.address.read();
  }

  write(link: string): void {
    this.address.write(withBarOpen(link, this.showsBar()));
  }

  /** The link as a full URL on this page, for Copy link and Share. */
  url(link: string): string {
    return linkUrl(withBarOpen(link, this.showsBar()));
  }
}

/**
 * The `s` parameter of the address bar, kept current without adding history
 * entries. Other parameters on the page are left as they are.
 */
export function addressBar(): AddressBar {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    read: () => new URLSearchParams(location.search).get(LINK_PARAM),
    write: (link) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const url = linkUrl(link);
        if (url !== location.href) history.replaceState(history.state, "", url);
      }, LINK_SETTLE_MS);
    },
  };
}

function linkUrl(link: string): string {
  const url = new URL(location.href);
  url.searchParams.set(LINK_PARAM, link);
  return url.toString();
}
