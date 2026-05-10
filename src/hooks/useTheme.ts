import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(
    () => (localStorage.getItem("theme") as ThemeMode | null) ?? "system"
  );

  useEffect(() => {
    localStorage.setItem("theme", theme);
    if (theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  function cycleTheme() {
    setTheme((current) => current === "system" ? "light" : current === "light" ? "dark" : "system");
  }

  return { theme, cycleTheme };
}
