export const THEME_COLOR_OPTIONS = [
  { key: "indigo", label: "靛蓝" },
  { key: "violet", label: "紫罗兰" },
  { key: "blue", label: "蓝" },
  { key: "rose", label: "玫瑰" },
  { key: "emerald", label: "翡翠绿" },
  { key: "amber", label: "琥珀" },
] as const;

export type ThemeColorKey = (typeof THEME_COLOR_OPTIONS)[number]["key"];

export const THEME_COLORS: Record<
  ThemeColorKey,
  { light: string; dark: string }
> = {
  indigo: {
    light: "oklch(0.541 0.179 288)",
    dark: "oklch(0.62 0.18 285)",
  },
  violet: {
    light: "oklch(0.541 0.19 293)",
    dark: "oklch(0.62 0.19 290)",
  },
  blue: {
    light: "oklch(0.546 0.18 256)",
    dark: "oklch(0.63 0.18 253)",
  },
  rose: {
    light: "oklch(0.586 0.2 17)",
    dark: "oklch(0.65 0.2 14)",
  },
  emerald: {
    light: "oklch(0.596 0.16 163)",
    dark: "oklch(0.67 0.16 160)",
  },
  amber: {
    light: "oklch(0.666 0.18 55)",
    dark: "oklch(0.72 0.17 53)",
  },
};

export function themeColorCSS(key: ThemeColorKey): string {
  const c = THEME_COLORS[key];
  if (!c || key === "indigo") return "";
  return `:root{--primary:${c.light};--ring:${c.light};--sidebar-primary:${c.light};--sidebar-ring:${c.light}}.dark{--primary:${c.dark};--ring:${c.dark};--sidebar-primary:${c.dark};--sidebar-ring:${c.dark}}`;
}
