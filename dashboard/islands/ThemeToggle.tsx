import { useEffect, useState } from "preact/hooks";

type Theme = "light" | "dark" | "system";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  // Initialize theme on mount
  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("theme") as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      setTheme("system");
    }
  }, []);

  // Apply theme when it changes
  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.toggle("dark", systemTheme === "dark");
    } else {
      root.classList.toggle("dark", theme === "dark");
    }

    localStorage.setItem("theme", theme);
  }, [theme, mounted]);

  // Listen for system theme changes
  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        const root = document.documentElement;
        root.classList.toggle("dark", mediaQuery.matches);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme, mounted]);

  const handleThemeChange = () => {
    const nextTheme: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(nextTheme);
  };

  const getThemeIcon = () => {
    switch (theme) {
      case "light": return "☀️";
      case "dark": return "🌙";
      case "system": return "💻";
      default: return "💻";
    }
  };

  const getThemeLabel = () => {
    switch (theme) {
      case "light": return "Light";
      case "dark": return "Dark"; 
      case "system": return "System";
      default: return "System";
    }
  };

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <div class="flex items-center space-x-2 opacity-0">
        <span class="text-2xl">💻</span>
        <span class="text-sm text-gray-500">System</span>
      </div>
    );
  }

  return (
    <button
      onClick={handleThemeChange}
      class="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors duration-200"
      title={`Current theme: ${getThemeLabel()}. Click to cycle through themes.`}
    >
      <span class="text-xl">{getThemeIcon()}</span>
      <span class="text-sm text-gray-700 dark:text-gray-300 font-medium">{getThemeLabel()}</span>
    </button>
  );
} 