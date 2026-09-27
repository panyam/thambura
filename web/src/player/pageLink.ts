import { decodePage, encodePage, withBarOpen } from "../engine/shareLink";

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

/** One instrument's part of the page link, as that instrument sees it. */
export interface LinkPart {
  /** Its part of the link the page was opened with (or its latest), or null. */
  read(): string | null;
  /** Its setup now; the page link is written again with every part. */
  write(link: string): void;
}

/**
 * The page's share link, made of one part per instrument (a page link,
 * engine/shareLink.ts, format 2). Each instrument reads and writes only its
 * own part; the parts the page was opened with carry on until their
 * instrument writes. A page with only thambura-1 writes a plain thambura
 * link, as it always has.
 *
 * The layout adds whether the thambura's bar is showing, which no
 * instrument knows: `showsBar` is true (a docked thambura is always in view)
 * until a drawer replaces it with its own open state.
 */
export class PageLink {
  showsBar: () => boolean = () => true;
  private readonly parts: Map<string, string>;

  /** `base` is the page URL links are made on; the current page if not given. */
  constructor(
    private readonly address: AddressBar,
    private readonly base?: string,
  ) {
    const opened = address.read();
    this.parts = (opened && decodePage(opened)) || new Map();
  }

  /** The part for the instrument with this id. */
  part(id: string): LinkPart {
    return {
      read: () => this.parts.get(id) ?? null,
      write: (link) => {
        this.parts.set(id, link);
        this.address.write(this.encode(this.parts));
      },
    };
  }

  /** The page link as a full URL, with `id`'s part set to `link`, for Copy link and Share. */
  url(id: string, link: string): string {
    const url = new URL(this.base ?? location.href);
    url.searchParams.set(LINK_PARAM, this.encode(new Map([...this.parts, [id, link]])));
    return url.toString();
  }

  private encode(parts: Map<string, string>): string {
    const open = this.showsBar();
    return encodePage(
      [...parts].map(([id, link]) => ({ id, link: id.startsWith("thambura-") ? withBarOpen(link, open) : link })),
    );
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
        const url = new URL(location.href);
        url.searchParams.set(LINK_PARAM, link);
        if (url.toString() !== location.href) history.replaceState(history.state, "", url.toString());
      }, LINK_SETTLE_MS);
    },
  };
}
