/**
 * The docs pages' script: the theme toggle, cycling light, dark and system
 * through tsappkit's ThemeManager, the same way and under the same
 * localStorage key as the app's, so a choice made in one holds in the other.
 * The page already set the theme before its first paint (BasePage.html).
 *
 * Live examples (#109) will be mounted from here.
 */
import { ThemeManager } from "@panyam/tsappkit";

function wireThemeToggle(button: HTMLButtonElement) {
  const show = () => {
    const setting = ThemeManager.getCurrentThemeSetting();
    button.innerHTML = ThemeManager.getIconSVG(setting);
    const label = `Theme: ${ThemeManager.getThemeLabel(setting)}`;
    button.title = label;
    button.setAttribute("aria-label", label);
  };
  button.addEventListener("click", () => {
    ThemeManager.setTheme(ThemeManager.getNextTheme(ThemeManager.getCurrentThemeSetting()));
    show();
  });
  show();
}

const toggle = document.getElementById("theme-toggle");
if (toggle instanceof HTMLButtonElement) wireThemeToggle(toggle);
