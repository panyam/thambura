/**
 * The docs pages' script: the theme toggle, cycling light, dark and system
 * through tsappkit's ThemeManager, the same way as the app's. The page
 * already set the theme before its first paint (BasePage.html).
 *
 * It also mounts the embed guide's live examples (embedExamples.ts).
 */
import { ThemeManager } from "@panyam/tsappkit";
import { mountExamples } from "./embedExamples";

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

void mountExamples(document);
