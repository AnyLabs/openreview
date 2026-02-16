import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadThemePreference, saveThemePreference, type ThemePreference } from "../services/storage";

type ResolvedTheme = "dark" | "light";

interface ThemeContextType {
  themeMode: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemeMode: (mode: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(getSystemTheme());
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hydrateTheme = async () => {
      const savedTheme = await loadThemePreference();
      if (cancelled) return;
      if (savedTheme) {
        setThemeMode(savedTheme);
      }
      setIsHydrated(true);
    };
    void hydrateTheme();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const nextTheme = themeMode === "system" ? getSystemTheme() : themeMode;
    setResolvedTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    if (isHydrated) {
      void saveThemePreference(themeMode);
    }
  }, [themeMode, isHydrated]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => {
      if (themeMode === "system") {
        setResolvedTheme(getSystemTheme());
        document.documentElement.setAttribute("data-theme", getSystemTheme());
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [themeMode]);

  const value = useMemo(
    () => ({ themeMode, resolvedTheme, setThemeMode }),
    [themeMode, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme 必须在 ThemeProvider 中使用");
  }
  return context;
}
