import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setTheme as setAppTheme } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, type Theme } from "@tauri-apps/api/window";
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

async function syncNativeTheme(themeMode: ThemePreference): Promise<void> {
  if (!isTauri()) return;
  const nativeTheme: Theme | null = themeMode === "system" ? null : themeMode;
  try {
    await setAppTheme(nativeTheme);
  } catch (error) {
    console.warn("同步原生窗口主题失败:", error);
  }
}

async function syncNativeWindowBackground(): Promise<void> {
  if (!isTauri()) return;
  try {
    const styles = getComputedStyle(document.documentElement);
    const backgroundColor =
      styles.getPropertyValue("--native-titlebar-bg").trim() ||
      styles.getPropertyValue("--bg-app").trim();
    if (!backgroundColor) return;
    await getCurrentWindow().setBackgroundColor(backgroundColor);
  } catch (error) {
    console.warn("同步原生窗口背景色失败:", error);
  }
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
    void syncNativeTheme(themeMode);
    if (isHydrated) {
      void saveThemePreference(themeMode);
    }
  }, [themeMode, isHydrated]);

  useEffect(() => {
    void syncNativeWindowBackground();
  }, [resolvedTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => {
      if (themeMode === "system") {
        const nextTheme = getSystemTheme();
        setResolvedTheme(nextTheme);
        document.documentElement.setAttribute("data-theme", nextTheme);
        void syncNativeTheme(themeMode);
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
