"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const STORAGE_KEY = "meraki-dashboard-theme";

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  // Read stored preference on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "dark" || stored === "light") {
        setTheme(stored);
        document.documentElement.classList.toggle("dark", stored === "dark");
      }
    } catch { /* localStorage unavailable */ }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      document.documentElement.classList.toggle("dark", next === "dark");
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Chart colors that adapt to the current theme.
 * Use inside components that render Recharts (which needs raw hex values).
 */
export function useChartColors() {
  const { theme } = useTheme();
  const dark = theme === "dark";

  return {
    // Backgrounds & chrome
    tooltipBg:     dark ? "#161B22" : "#F5F7FA",
    tooltipBorder: dark ? "#30363D" : "#D8DDE3",
    gridLine:      dark ? "#30363D" : "#D8DDE3",
    axisLine:      dark ? "#30363D" : "#D8DDE3",
    tickFill:      dark ? "#8C9BAB" : "#6B7C8F",
    labelFill:     dark ? "#E6EDF3" : "#2C3E50",

    // Series
    teal:    "#049FD9",
    green:   "#36B37E",
    primary: "#78BE20",
    red:     "#DE350B",
    orange:  "#FF8B00",
    muted:   dark ? "#8C9BAB" : "#6B7C8F",

    // Cursor / hover
    cursorFill: dark ? "rgba(120,190,32,0.08)" : "rgba(120,190,32,0.06)",

    // Bar opacity helper
    barAlpha: (ratio: number) => 0.4 + ratio * 0.6,
  };
}
