import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

const TEXTLESS = new Set(["loading_backdrop", "loading_bar", "loading_fill", "cutscene"]);

type Rgba = [number, number, number, number];

const NAMED: Record<string, Rgba> = {
  black: [0, 0, 0, 1],
  white: [255, 255, 255, 1],
};

const parseColor = (value: unknown): Rgba | undefined => {
  if (typeof value !== "string") return undefined;
  const v = value.trim().replace(/^"|"$/g, "");
  if (NAMED[v]) return NAMED[v];
  const m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[/,]\s*([\d.]+)(%?))?\s*\)$/);
  if (!m) return undefined;
  const a = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
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
    contrast(over(ink, over(background, NAMED.white!)), over(background, NAMED.white!)),
    contrast(over(ink, over(background, NAMED.black!)), over(background, NAMED.black!)),
  );

const builtinStyles = (): Record<string, any> => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: "scene A\n  Hi.\nend\n", version: 1, languageId: "sparkdown" },
    ],
  });
  const program: any = compiler.compile({ textDocument: { uri: URI } }).program;
  return program.styles ?? {};
};

type Pair = { style: string; path: string; background: unknown; ink: unknown };

const backgroundPairs = (styles: Record<string, any>): Pair[] => {
  const pairs: Pair[] = [];
  const walk = (style: string, block: any, path: string, inheritedInk: unknown) => {
    const ink = block.color ?? inheritedInk;
    if (block.background_color !== undefined) {
      pairs.push({ style, path, background: block.background_color, ink });
    }
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
  const styles = builtinStyles();
  const pairs = backgroundPairs(styles).filter(
    (p) => !TEXTLESS.has(p.style) && parseColor(p.background) !== undefined,
  );

  test("the builtins include the choice background", () => {
    expect(pairs.some((p) => p.style === "choice")).toBe(true);
  });

  test("every one sets a text colour that reads against it", () => {
    const failures = pairs
      .map((p) => {
        const ink = parseColor(p.ink);
        const ratio = ink ? worstContrast(ink, parseColor(p.background)!) : 0;
        return { at: p.path, background: p.background, ink: p.ink ?? null, ratio: Number(ratio.toFixed(2)) };
      })
      .filter((r) => r.ratio < 4.5);
    expect(failures).toEqual([]);
  });

  test("loading text reads against the loading backdrop", () => {
    const ink = parseColor(styles.loading_content?.color);
    const backdrop = parseColor(styles.loading_backdrop?.background_color);
    expect(ink && backdrop ? worstContrast(ink, backdrop) : 0).toBeGreaterThanOrEqual(4.5);
  });
});
