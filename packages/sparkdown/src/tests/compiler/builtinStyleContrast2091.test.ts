import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

const CONTROL_BOX = "&:where(:not(label)), > :where(.control)";
const TINT_ALPHA = 0.1;

const TEXTLESS: { name: string; holds: (path: string, alpha: number) => boolean }[] = [
  ...["loading_backdrop", "loading_bar", "loading_fill", "cutscene", "progress", "progress_fill"].map((style) => ({
    name: style,
    holds: (path: string) => path === style || path.startsWith(`${style} `),
  })),
  ...["checkbox", "radio", "switch", "slider"].map((style) => ({
    name: `${style} control box`,
    holds: (path: string) => path.startsWith(`${style} ${CONTROL_BOX}`),
  })),
  { name: `tint under ${TINT_ALPHA * 100}% opacity`, holds: (_path: string, alpha: number) => alpha < TINT_ALPHA },
];

const ACCENT_EXCEPTIONS: Record<string, number> = {
  badge: 2.77,
  "button @hovered, @pressed, @focused": 4.1,
};

type Rgba = [number, number, number, number];

const WHITE: Rgba = [255, 255, 255, 1];
const BLACK: Rgba = [0, 0, 0, 1];

const compileBuiltins = (prefix = "") => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: `${prefix}scene A\n  Hi.\nend\n`, version: 1, languageId: "sparkdown" },
    ],
  });
  const program: any = compiler.compile({ textDocument: { uri: URI } }).program;
  return { styles: program.styles ?? {}, palette: program.context?.color ?? {} };
};

const { styles, palette } = compileBuiltins();

const parseColor = (value: unknown, ink?: unknown, depth = 0): Rgba | undefined => {
  if (typeof value !== "string" || depth > 4) return undefined;
  const v = value.trim().replace(/^"|"$/g, "");
  if (v === "transparent" || v === "none") return [0, 0, 0, 0];
  const mix = v.match(/^color-mix\(\s*in srgb\s*,\s*currentColor\s+([\d.]+)%\s*,\s*transparent\s*\)$/i);
  if (mix) {
    const current = parseColor(ink, undefined, depth + 1) ?? BLACK;
    return [current[0], current[1], current[2], Number(mix[1]) / 100];
  }
  const m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[/,]\s*([\d.]+)(%?))?\s*\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  const named = palette[v];
  return named ? parseColor(named.value, ink, depth + 1) : undefined;
};

const over = (top: Rgba, base: Rgba): Rgba => [
  top[0] * top[3] + base[0] * (1 - top[3]),
  top[1] * top[3] + base[1] * (1 - top[3]),
  top[2] * top[3] + base[2] * (1 - top[3]),
  1,
];

const luminance = ([r, g, b]: Rgba) => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const contrast = (a: Rgba, b: Rgba) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const worstContrast = (ink: Rgba, background: Rgba) =>
  Math.min(
    ...[WHITE, BLACK].map((page) => {
      const surface = over(background, page);
      return contrast(over(ink, surface), surface);
    }),
  );

const prop = (block: any, name: string) => block[name] ?? block[name.replace(/_/g, "-")];
const inkOf = (block: any) => prop(block, "text_color") ?? block.color;

type Pair = { style: string; path: string; background: unknown; ink: unknown };

const backgroundPairs = (styles: Record<string, any>): Pair[] => {
  const pairs: Pair[] = [];
  const walk = (style: string, block: any, path: string, inheritedInk: unknown) => {
    const ink = inkOf(block) ?? inheritedInk;
    const background = prop(block, "background_color") ?? block.background;
    if (background !== undefined) pairs.push({ style, path, background, ink });
    for (const [key, child] of Object.entries(block)) {
      if (child && typeof child === "object" && !key.startsWith("$")) {
        walk(style, child, `${path} ${key}`, ink);
      }
    }
  };
  for (const [name, style] of Object.entries(styles)) {
    if (style && typeof style === "object") walk(name, style, name, undefined);
  }
  return pairs;
};

describe("builtin styles that set a background", () => {
  const all = backgroundPairs(styles);
  const pairs = all.filter((p) => {
    const background = parseColor(p.background, p.ink);
    return background !== undefined && !TEXTLESS.some((t) => t.holds(p.path, background[3]));
  });

  test("every builtin background is a colour the test can measure", () => {
    expect(all.filter((p) => parseColor(p.background, p.ink) === undefined).map((p) => `${p.path}: ${p.background}`)).toEqual([]);
  });

  test("the walk reads both property spellings and the builtin palette", () => {
    expect(pairs.some((p) => p.style === "choice")).toBe(true);
    expect(pairs.some((p) => p.style === "code" && p.background === "slate_30")).toBe(true);
    expect(pairs.some((p) => p.path.startsWith("button") && p.background === "sky_40")).toBe(true);
    expect(parseColor("slate_30")).toEqual([30, 41, 59, 1]);
    expect(parseColor("color-mix(in srgb, currentColor 6%, transparent)", "white")).toEqual([255, 255, 255, 0.06]);
    expect(parseColor("transparent")).toEqual([0, 0, 0, 0]);
  });

  const measured = pairs.map((p) => {
    const ink = parseColor(p.ink);
    const ratio = ink ? worstContrast(ink, parseColor(p.background, p.ink)!) : 0;
    return { at: p.path, background: p.background, ink: p.ink ?? null, ratio: Number(ratio.toFixed(2)) };
  });

  test("every one sets a text colour that reads against it, apart from the listed accent pairs", () => {
    expect(measured.filter((r) => r.ratio < 4.5 && !(r.at in ACCENT_EXCEPTIONS))).toEqual([]);
  });

  test("the listed accent pairs are exactly the ones below 4.5:1 and none has got worse", () => {
    const below = Object.fromEntries(measured.filter((r) => r.ratio < 4.5).map((r) => [r.at, r.ratio]));
    expect(Object.keys(below).sort()).toEqual(Object.keys(ACCENT_EXCEPTIONS).sort());
    for (const [at, ratio] of Object.entries(ACCENT_EXCEPTIONS)) {
      expect(below[at], at).toBeGreaterThanOrEqual(ratio);
    }
  });

  test("each exclusion still matches a builtin background", () => {
    const unused = TEXTLESS.filter((t) => !all.some((p) => {
      const background = parseColor(p.background, p.ink);
      return background !== undefined && t.holds(p.path, background[3]);
    })).map((t) => t.name);
    expect(unused).toEqual([]);
  });

  test("loading text reads against the loading backdrop", () => {
    const ink = parseColor(inkOf(styles.loading_content ?? {}));
    const backdrop = parseColor(prop(styles.loading_backdrop ?? {}, "background_color"));
    expect(ink && backdrop ? worstContrast(ink, backdrop) : 0).toBeGreaterThanOrEqual(4.5);
  });
});
