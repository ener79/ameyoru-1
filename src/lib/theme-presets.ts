export interface ThemePreset {
  key: string;
  label: string;
  description: string;
  preview: { primary: string; secondary: string; accent: string };
  css: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: "default",
    label: "靛蓝",
    description: "默认主题，中性灰底 + 靛蓝主色",
    preview: { primary: "oklch(0.541 0.179 288)", secondary: "oklch(0.97 0 0)", accent: "oklch(0.97 0 0)" },
    css: "",
  },
  {
    key: "midnight",
    label: "午夜蓝",
    description: "深蓝主色，偏商务稳重",
    preview: { primary: "oklch(0.55 0.15 250)", secondary: "oklch(0.96 0.005 250)", accent: "oklch(0.95 0.01 250)" },
    css: `:root{--primary:oklch(0.55 0.15 250);--primary-foreground:oklch(0.985 0 0);--secondary:oklch(0.96 0.005 250);--secondary-foreground:oklch(0.2 0.02 250);--accent:oklch(0.95 0.01 250);--accent-foreground:oklch(0.2 0.02 250);--muted:oklch(0.96 0.005 250);--muted-foreground:oklch(0.46 0.02 250);--ring:oklch(0.55 0.15 250);--sidebar-primary:oklch(0.55 0.15 250);--sidebar-primary-foreground:oklch(0.985 0 0);--sidebar-ring:oklch(0.55 0.15 250)}.dark{--primary:oklch(0.65 0.14 248);--primary-foreground:oklch(0.985 0 0);--secondary:oklch(0.27 0.01 250);--secondary-foreground:oklch(0.985 0 0);--accent:oklch(0.27 0.01 250);--accent-foreground:oklch(0.985 0 0);--muted:oklch(0.27 0.01 250);--muted-foreground:oklch(0.7 0.02 250);--ring:oklch(0.65 0.14 248);--sidebar-primary:oklch(0.65 0.14 248);--sidebar-primary-foreground:oklch(0.985 0 0);--sidebar-ring:oklch(0.65 0.14 248)}`,
  },
  {
    key: "violet",
    label: "紫罗兰",
    description: "紫色系，适合创意/娱乐",
    preview: { primary: "oklch(0.55 0.2 295)", secondary: "oklch(0.96 0.01 295)", accent: "oklch(0.95 0.015 295)" },
    css: `:root{--primary:oklch(0.55 0.2 295);--primary-foreground:oklch(0.985 0 0);--secondary:oklch(0.96 0.01 295);--secondary-foreground:oklch(0.2 0.03 295);--accent:oklch(0.95 0.015 295);--accent-foreground:oklch(0.2 0.03 295);--muted:oklch(0.96 0.01 295);--muted-foreground:oklch(0.46 0.03 295);--ring:oklch(0.55 0.2 295);--sidebar-primary:oklch(0.55 0.2 295);--sidebar-primary-foreground:oklch(0.985 0 0);--sidebar-ring:oklch(0.55 0.2 295)}.dark{--primary:oklch(0.65 0.19 292);--primary-foreground:oklch(0.985 0 0);--secondary:oklch(0.27 0.015 295);--secondary-foreground:oklch(0.985 0 0);--accent:oklch(0.27 0.015 295);--accent-foreground:oklch(0.985 0 0);--muted:oklch(0.27 0.015 295);--muted-foreground:oklch(0.7 0.03 295);--ring:oklch(0.65 0.19 292);--sidebar-primary:oklch(0.65 0.19 292);--sidebar-primary-foreground:oklch(0.985 0 0);--sidebar-ring:oklch(0.65 0.19 292)}`,
  },
  {
    key: "rose",
    label: "玫瑰粉",
    description: "粉色系，偏年轻时尚",
    preview: { primary: "oklch(0.59 0.2 15)", secondary: "oklch(0.97 0.008 15)", accent: "oklch(0.96 0.012 15)" },
    css: `:root{--primary:oklch(0.59 0.2 15);--primary-foreground:oklch(0.985 0 0);--secondary:oklch(0.97 0.008 15);--secondary-foreground:oklch(0.2 0.03 15);--accent:oklch(0.96 0.012 15);--accent-foreground:oklch(0.2 0.03 15);--muted:oklch(0.97 0.008 15);--muted-foreground:oklch(0.46 0.03 15);--ring:oklch(0.59 0.2 15);--sidebar-primary:oklch(0.59 0.2 15);--sidebar-primary-foreground:oklch(0.985 0 0);--sidebar-ring:oklch(0.59 0.2 15)}.dark{--primary:oklch(0.66 0.19 13);--primary-foreground:oklch(0.985 0 0);--secondary:oklch(0.27 0.015 15);--secondary-foreground:oklch(0.985 0 0);--accent:oklch(0.27 0.015 15);--accent-foreground:oklch(0.985 0 0);--muted:oklch(0.27 0.015 15);--muted-foreground:oklch(0.7 0.03 15);--ring:oklch(0.66 0.19 13);--sidebar-primary:oklch(0.66 0.19 13);--sidebar-primary-foreground:oklch(0.985 0 0);--sidebar-ring:oklch(0.66 0.19 13)}`,
  },
  {
    key: "emerald",
    label: "翡翠绿",
    description: "绿色系，清新自然",
    preview: { primary: "oklch(0.6 0.17 163)", secondary: "oklch(0.97 0.008 163)", accent: "oklch(0.96 0.012 163)" },
    css: `:root{--primary:oklch(0.6 0.17 163);--primary-foreground:oklch(0.985 0 0);--secondary:oklch(0.97 0.008 163);--secondary-foreground:oklch(0.2 0.02 163);--accent:oklch(0.96 0.012 163);--accent-foreground:oklch(0.2 0.02 163);--muted:oklch(0.97 0.008 163);--muted-foreground:oklch(0.46 0.02 163);--ring:oklch(0.6 0.17 163);--sidebar-primary:oklch(0.6 0.17 163);--sidebar-primary-foreground:oklch(0.985 0 0);--sidebar-ring:oklch(0.6 0.17 163)}.dark{--primary:oklch(0.68 0.16 160);--primary-foreground:oklch(0.985 0 0);--secondary:oklch(0.27 0.012 163);--secondary-foreground:oklch(0.985 0 0);--accent:oklch(0.27 0.012 163);--accent-foreground:oklch(0.985 0 0);--muted:oklch(0.27 0.012 163);--muted-foreground:oklch(0.7 0.02 163);--ring:oklch(0.68 0.16 160);--sidebar-primary:oklch(0.68 0.16 160);--sidebar-primary-foreground:oklch(0.985 0 0);--sidebar-ring:oklch(0.68 0.16 160)}`,
  },
  {
    key: "amber",
    label: "琥珀金",
    description: "暖金色系，质感高级",
    preview: { primary: "oklch(0.67 0.18 55)", secondary: "oklch(0.97 0.01 55)", accent: "oklch(0.96 0.015 55)" },
    css: `:root{--primary:oklch(0.67 0.18 55);--primary-foreground:oklch(0.145 0 0);--secondary:oklch(0.97 0.01 55);--secondary-foreground:oklch(0.2 0.03 55);--accent:oklch(0.96 0.015 55);--accent-foreground:oklch(0.2 0.03 55);--muted:oklch(0.97 0.01 55);--muted-foreground:oklch(0.46 0.03 55);--ring:oklch(0.67 0.18 55);--sidebar-primary:oklch(0.67 0.18 55);--sidebar-primary-foreground:oklch(0.145 0 0);--sidebar-ring:oklch(0.67 0.18 55)}.dark{--primary:oklch(0.73 0.17 53);--primary-foreground:oklch(0.145 0 0);--secondary:oklch(0.27 0.015 55);--secondary-foreground:oklch(0.985 0 0);--accent:oklch(0.27 0.015 55);--accent-foreground:oklch(0.985 0 0);--muted:oklch(0.27 0.015 55);--muted-foreground:oklch(0.7 0.03 55);--ring:oklch(0.73 0.17 53);--sidebar-primary:oklch(0.73 0.17 53);--sidebar-primary-foreground:oklch(0.145 0 0);--sidebar-ring:oklch(0.73 0.17 53)}`,
  },
  {
    key: "zinc",
    label: "锌灰",
    description: "纯灰无彩色，极简克制",
    preview: { primary: "oklch(0.27 0 0)", secondary: "oklch(0.97 0 0)", accent: "oklch(0.95 0 0)" },
    css: `:root{--primary:oklch(0.27 0 0);--primary-foreground:oklch(0.985 0 0);--ring:oklch(0.27 0 0);--sidebar-primary:oklch(0.27 0 0);--sidebar-primary-foreground:oklch(0.985 0 0);--sidebar-ring:oklch(0.27 0 0)}.dark{--primary:oklch(0.92 0 0);--primary-foreground:oklch(0.145 0 0);--ring:oklch(0.92 0 0);--sidebar-primary:oklch(0.92 0 0);--sidebar-primary-foreground:oklch(0.145 0 0);--sidebar-ring:oklch(0.92 0 0)}`,
  },
  {
    key: "sunset",
    label: "落日橙",
    description: "橙色系，活力温暖",
    preview: { primary: "oklch(0.65 0.2 38)", secondary: "oklch(0.97 0.01 38)", accent: "oklch(0.96 0.015 38)" },
    css: `:root{--primary:oklch(0.65 0.2 38);--primary-foreground:oklch(0.985 0 0);--secondary:oklch(0.97 0.01 38);--secondary-foreground:oklch(0.2 0.03 38);--accent:oklch(0.96 0.015 38);--accent-foreground:oklch(0.2 0.03 38);--muted:oklch(0.97 0.01 38);--muted-foreground:oklch(0.46 0.03 38);--ring:oklch(0.65 0.2 38);--sidebar-primary:oklch(0.65 0.2 38);--sidebar-primary-foreground:oklch(0.985 0 0);--sidebar-ring:oklch(0.65 0.2 38)}.dark{--primary:oklch(0.72 0.19 36);--primary-foreground:oklch(0.985 0 0);--secondary:oklch(0.27 0.015 38);--secondary-foreground:oklch(0.985 0 0);--accent:oklch(0.27 0.015 38);--accent-foreground:oklch(0.985 0 0);--muted:oklch(0.27 0.015 38);--muted-foreground:oklch(0.7 0.03 38);--ring:oklch(0.72 0.19 36);--sidebar-primary:oklch(0.72 0.19 36);--sidebar-primary-foreground:oklch(0.985 0 0);--sidebar-ring:oklch(0.72 0.19 36)}`,
  },
];

const PRESET_MAP = new Map(THEME_PRESETS.map((p) => [p.key, p]));

export function getPresetCSS(key: string): string {
  return PRESET_MAP.get(key)?.css ?? "";
}

const DANGEROUS_PATTERNS = [
  /url\s*\(/i,
  /expression\s*\(/i,
  /@import/i,
  /<script/i,
  /javascript:/i,
  /behavior\s*:/i,
  /-moz-binding/i,
];

export function validateCustomCSS(css: string): string | null {
  if (css.length > 10240) return "自定义 CSS 不能超过 10KB";
  for (const p of DANGEROUS_PATTERNS) {
    if (p.test(css)) return "CSS 中包含不安全的内容";
  }
  return null;
}
