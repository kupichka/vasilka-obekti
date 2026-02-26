type Theme = 'light' | 'dark';

let themeStyleElement: HTMLStyleElement | null = null;

class ThemeService {
  private currentTheme: Theme = 'light';

  constructor() {
    // Check localStorage for saved preference
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved) {
      this.currentTheme = saved;
      this.applyTheme(saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.currentTheme = 'dark';
      this.applyTheme('dark');
    }
  }

  private async applyTheme(theme: Theme) {
    // Create a style element if it doesn't exist
    if (!themeStyleElement) {
      themeStyleElement = document.createElement('style');
      themeStyleElement.id = 'theme-vars';
      document.head.appendChild(themeStyleElement);
    }

    try {
      const filename = theme === 'dark' ? '/src/dark.css' : '/src/light.css';
      const response = await fetch(filename);
      const css = await response.text();
      
      // Extract just the :root variables part
      const rootMatch = css.match(/:root\s*{[^}]+}/);
      if (rootMatch) {
        themeStyleElement.textContent = rootMatch[0];
        localStorage.setItem('theme', theme);
      }
    } catch (error) {
      console.error(`Failed to load theme ${theme}:`, error);
    }
  }

  toggleTheme(): Theme {
    const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.currentTheme = newTheme;
    this.applyTheme(newTheme);
    return newTheme;
  }

  getTheme(): Theme {
    return this.currentTheme;
  }
}

export const themeService = new ThemeService();
