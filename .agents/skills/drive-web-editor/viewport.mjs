import path from "node:path";

export const DEFAULT_VIEWPORT = { width: 1600, height: 1000 };

export const VIEWPORT_PRESETS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  phone: { width: 360, height: 780, touch: true },
  "phone-large": { width: 430, height: 932, touch: true },
};

export const COLOR_SCHEMES = ["light", "dark"];

export const PREFERENCES_STORAGE_KEY = "settings/preferences";

const THEME_SEEDED_MARKER = "impower-driver-theme-seeded";

const presetList = () => Object.entries(VIEWPORT_PRESETS).map(([name, v]) => `${name} (${v.width}x${v.height})`).join(", ");

export function parseViewport(spec) {
  if (Object.hasOwn(VIEWPORT_PRESETS, spec)) {
    const { width, height, touch = false } = VIEWPORT_PRESETS[spec];
    return { name: spec, width, height, touch };
  }
  const m = /^(\d+)x(\d+)$/.exec(spec ?? "");
  const width = m ? Number(m[1]) : 0;
  const height = m ? Number(m[2]) : 0;
  if (width < 1 || height < 1 || width > 10_000 || height > 10_000) {
    throw new Error(`--viewport takes a preset or WIDTHxHEIGHT in pixels (1..10000), got "${spec}"; presets: ${presetList()}`);
  }
  return { name: `${width}x${height}`, width, height, touch: false };
}

export function takeDisplayFlags(argv) {
  const display = { viewport: null, colorScheme: null, theme: null };
  const take = (name) => {
    const at = argv.indexOf(name);
    if (at < 0) return null;
    const value = argv[at + 1];
    if (value == null || value === "" || value.startsWith("--")) throw new Error(`${name} needs a value`);
    argv.splice(at, 2);
    if (argv.includes(name)) throw new Error(`${name} was given more than once`);
    return value;
  };
  const viewport = take("--viewport");
  if (viewport != null) display.viewport = parseViewport(viewport);
  const scheme = take("--color-scheme");
  if (scheme != null) {
    if (!COLOR_SCHEMES.includes(scheme)) throw new Error(`--color-scheme takes ${COLOR_SCHEMES.join(" or ")}, got "${scheme}"`);
    display.colorScheme = scheme;
  }
  const theme = take("--theme");
  if (theme != null) {
    if (!/^[a-z][a-z0-9-]*$/.test(theme)) throw new Error(`--theme takes a lowercase theme name such as charcoal, got "${theme}"`);
    display.theme = theme;
  }
  return display;
}

export function hasDisplayFlags(display) {
  return Boolean(display.viewport || display.colorScheme || display.theme);
}

export function contextOptions(display) {
  const vp = display.viewport;
  return {
    viewport: vp ? { width: vp.width, height: vp.height } : { ...DEFAULT_VIEWPORT },
    ...(vp?.touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 3 } : {}),
    ...(display.colorScheme ? { colorScheme: display.colorScheme } : {}),
  };
}

export function displayReport(display) {
  const { width, height } = contextOptions(display).viewport;
  return {
    viewport: display.viewport?.name ?? "default",
    width,
    height,
    touch: Boolean(display.viewport?.touch),
    colorScheme: display.colorScheme,
    theme: display.theme,
  };
}

export function seedThemePreference({ key, theme, marker }) {
  try {
    if (window.top !== window || sessionStorage.getItem(marker)) return;
    sessionStorage.setItem(marker, "1");
    let stored = {};
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed;
    } catch {}
    if (theme == null) delete stored.theme;
    else stored.theme = theme;
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {}
}

export function themeSeed(display) {
  return { key: PREFERENCES_STORAGE_KEY, theme: display.theme, marker: THEME_SEEDED_MARKER };
}

export function themeMismatch(display, renderedTheme) {
  if (!display.theme || renderedTheme === display.theme) return null;
  if (display.theme === "automatic" && renderedTheme) return null;
  return `--theme ${display.theme} was set as the theme preference but the editor rendered ${renderedTheme ?? "no theme"}; the editor does not offer that theme`;
}

export function shotFileName(name, display) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name ?? "") || name.toLowerCase().endsWith(".png")) {
    throw new Error(`screenshot takes a bare name such as story (letters, digits, . _ -, no .png), got "${name}"`);
  }
  const parts = [name, display.viewport?.name, display.theme, display.colorScheme].filter(Boolean);
  return `${parts.join("-")}.png`;
}

export function screenshotPath(name, display, outDir = ".") {
  return path.resolve(outDir, shotFileName(name, display));
}
