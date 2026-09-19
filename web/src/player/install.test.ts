import { describe, expect, it, vi } from "vitest";
import { isIOS, isInstalled, wireInstall, type InstallPrompt } from "./install";

class FakeToggle {
  hidden = true;
  clicks: (() => void)[] = [];
  addEventListener(_type: "click", cb: () => void) {
    this.clicks.push(cb);
  }
  click() {
    this.clicks.forEach((cb) => cb());
  }
}

class FakeHost {
  listeners: Record<string, ((e: InstallPrompt) => void)[]> = {};
  addEventListener(type: string, cb: (e: InstallPrompt) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  fire(type: string, e: InstallPrompt) {
    (this.listeners[type] ?? []).forEach((cb) => cb(e));
  }
}

const prompt = () => ({ preventDefault: vi.fn(), prompt: vi.fn().mockResolvedValue(undefined) });

describe("wireInstall", () => {
  const setup = (env: { installed: boolean; ios: boolean }) => {
    const host = new FakeHost();
    const button = new FakeToggle();
    const hint = new FakeToggle();
    wireInstall(host, { button, hint }, env);
    return { host, button, hint };
  };

  it("offers the button once the browser says the app can be installed", () => {
    const { host, button, hint } = setup({ installed: false, ios: false });
    expect(button.hidden).toBe(true);
    const e = prompt();
    host.fire("beforeinstallprompt", e);
    expect(e.preventDefault).toHaveBeenCalled(); // the browser's own hint stays away
    expect(button.hidden).toBe(false);
    expect(hint.hidden).toBe(true);

    button.click();
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(button.hidden).toBe(true);
    button.click(); // a prompt can only be shown once
    expect(e.prompt).toHaveBeenCalledTimes(1);
  });

  it("tells an iPhone to use Share instead, since it never prompts", () => {
    const { button, hint } = setup({ installed: false, ios: true });
    expect(hint.hidden).toBe(false);
    expect(button.hidden).toBe(true);
  });

  it("offers nothing in an installed app", () => {
    const { host, button, hint } = setup({ installed: true, ios: true });
    host.fire("beforeinstallprompt", prompt());
    expect(button.hidden).toBe(true);
    expect(hint.hidden).toBe(true);
  });

  it("puts both away once installed", () => {
    const { host, button, hint } = setup({ installed: false, ios: true });
    host.fire("beforeinstallprompt", prompt());
    host.fire("appinstalled", prompt());
    expect(button.hidden).toBe(true);
    expect(hint.hidden).toBe(true);
  });
});

describe("isInstalled", () => {
  it("knows the display mode and Safari's flag", () => {
    expect(isInstalled({ matchMedia: () => ({ matches: true }) }, {})).toBe(true);
    expect(isInstalled({ matchMedia: () => ({ matches: false }) }, { standalone: true })).toBe(true);
    expect(isInstalled({ matchMedia: () => ({ matches: false }) }, {})).toBe(false);
    expect(isInstalled({}, {})).toBe(false);
  });
});

describe("isIOS", () => {
  it("spots iPhones and iPads, including the ones claiming to be Macs", () => {
    expect(isIOS({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" })).toBe(true);
    expect(isIOS({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 0 })).toBe(false);
    expect(isIOS({ userAgent: "Mozilla/5.0 (Linux; Android 14)" })).toBe(false);
    expect(isIOS({})).toBe(false);
  });
});
