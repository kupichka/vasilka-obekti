// Theme service now only applies the dark stylesheet once.  The UI
// no longer supports switching between light/dark, so the toggle is
// repurposed to just affect map tiles.  Keep the implementation around
// solely for legacy imports (main.tsx used to initialize it) but it
// behaves as a no-op and always reports "dark".

type Theme = 'dark';

let themeStyleElement: HTMLStyleElement | null = null;

class ThemeService {
  constructor() {
    this.applyDark();
  }

  private async applyDark() {
    if (!themeStyleElement) {
      themeStyleElement = document.createElement('style');
      themeStyleElement.id = 'theme-vars';
      document.head.appendChild(themeStyleElement);
    }

    try {
      const response = await fetch('/src/dark.css');
      const css = await response.text();
      const rootMatch = css.match(/:root\s*{[^}]+}/);
      if (rootMatch) {
        themeStyleElement.textContent = rootMatch[0];
      }
    } catch (error) {
      console.error('Failed to load dark theme:', error);
    }
  }

  // no-op toggle, always returns dark
  toggleTheme(): Theme {
    return 'dark';
  }

  getTheme(): Theme {
    return 'dark';
  }
}

export const themeService = new ThemeService();
