/**
 * Installing the app on a phone or desktop, so it gets its own icon and opens
 * without browser chrome.
 *
 * Chrome and Edge fire `beforeinstallprompt` when the site qualifies (a
 * manifest, icons, and a service worker handling fetch). They show only a
 * small hint of their own, so the page keeps that event and offers a button
 * instead. Safari never fires it: on an iPhone the only way in is Share ->
 * Add to Home Screen, so the page says so. A page already running installed
 * offers neither.
 */

/** The `beforeinstallprompt` event, as far as we use it. */
export interface InstallPrompt {
  preventDefault(): void;
  prompt(): Promise<unknown>;
}

/** An element the page can show, hide and listen to. */
export interface Toggle {
  hidden: boolean;
  addEventListener(type: "click", cb: () => void): void;
}

/** `window`, or a fake. */
export interface InstallHost {
  addEventListener(type: "beforeinstallprompt" | "appinstalled", cb: (e: InstallPrompt) => void): void;
}

/** True when the page is already running as an installed app. */
export function isInstalled(win: { matchMedia?(q: string): { matches: boolean } }, nav: { standalone?: boolean }): boolean {
  return Boolean(win.matchMedia?.("(display-mode: standalone)").matches || nav.standalone);
}

/** True on an iPhone or iPad browser, where installing goes through Share. */
export function isIOS(nav: { userAgent?: string; maxTouchPoints?: number; platform?: string }): boolean {
  const ua = nav.userAgent ?? "";
  // iPadOS reports itself as a Mac, so a Mac with a touch screen is an iPad.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1);
}

/**
 * Shows `button` once the browser offers to install, and `hint` on iOS where
 * it never will. Both stay hidden in an installed app.
 */
export function wireInstall(
  host: InstallHost,
  ui: { button: Toggle | null; hint: Toggle | null },
  env: { installed: boolean; ios: boolean },
): void {
  const { button, hint } = ui;
  if (env.installed) return;
  if (env.ios && hint) hint.hidden = false;

  let waiting: InstallPrompt | null = null;
  host.addEventListener("beforeinstallprompt", (e) => {
    // Keep the browser's own hint out of the way; the page's button replaces it.
    e.preventDefault();
    waiting = e;
    if (button) button.hidden = false;
    if (hint) hint.hidden = true;
  });
  host.addEventListener("appinstalled", () => {
    waiting = null;
    if (button) button.hidden = true;
    if (hint) hint.hidden = true;
  });

  button?.addEventListener("click", () => {
    const prompt = waiting;
    if (!prompt) return;
    // It can only be shown once; the browser fires the event again if the
    // person dismisses it and the site still qualifies.
    waiting = null;
    if (button) button.hidden = true;
    void prompt.prompt();
  });
}
