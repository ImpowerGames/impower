import type { Locator } from "@playwright/test";

/** Reads a fixed set of computed-style properties from an element (§8).
 * Color-valued properties are canonicalized through a canvas 2d context so the
 * port's Tailwind-v4 `oklab(...)` and the baseline's `rgba(...)` for the SAME
 * color compare equal (canvas resolves any CSS color to rgb/rgba). */
export async function readComputed(
  locator: Locator,
  props: string[],
): Promise<Record<string, string>> {
  return locator.evaluate((el, props: string[]) => {
    const COLOR_PROPS = new Set([
      "color", "backgroundColor", "borderColor",
      "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
      "fill", "stroke", "caretColor", "outlineColor", "textDecorationColor", "columnRuleColor",
    ]);
    const cs = getComputedStyle(el as Element);
    const cssName = (p: string) => p.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    let ctx: CanvasRenderingContext2D | null | undefined;
    // oklab/oklch → sRGB (this Chromium's canvas + getComputedStyle keep oklab
    // as-authored, so convert mathematically; Tailwind v4 emits oklab/oklch).
    const toSrgbByte = (c: number) => {
      const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
      return Math.round(Math.max(0, Math.min(1, s)) * 255);
    };
    const oklabToRgb = (L: number, a: number, b: number) => {
      const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = L - 0.0894841775 * a - 1.291485548 * b;
      const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
      return [
        toSrgbByte(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        toSrgbByte(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        toSrgbByte(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
      ];
    };
    const nums = (s: string) => (s.match(/-?[\d.]+%?/g) || []).map((t) =>
      t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t));
    const canon = (v: string): string => {
      if (!v) return v;
      const m = v.trim().match(/^okl(ab|ch)\(([^)]*)\)/i);
      if (m) {
        const parts = m[2].split("/");
        const [L, c2, c3] = nums(parts[0]);
        const alpha = parts[1] != null ? (nums(parts[1])[0] ?? 1) : 1;
        let a = c2, b = c3;
        if (m[1].toLowerCase() === "ch") {
          const h = (c3 * Math.PI) / 180;
          a = c2 * Math.cos(h);
          b = c2 * Math.sin(h);
        }
        const [r, g, bl] = oklabToRgb(L, a, b);
        return alpha >= 1 ? `rgb(${r}, ${g}, ${bl})` : `rgba(${r}, ${g}, ${bl}, ${alpha})`;
      }
      try {
        ctx ||= document.createElement("canvas").getContext("2d");
        if (!ctx) return v;
        ctx.fillStyle = "#abcdef";
        ctx.fillStyle = v;
        const resolved = ctx.fillStyle as string;
        return resolved === "#abcdef" && v.trim() !== "#abcdef" ? v : resolved;
      } catch {
        return v;
      }
    };
    const out: Record<string, string> = {};
    for (const p of props) {
      let v = cs.getPropertyValue(cssName(p)) || ((cs as unknown as Record<string, string>)[p] ?? "");
      if (COLOR_PROPS.has(p)) v = canon(v);
      out[p] = v;
    }
    return out;
  }, props);
}

export interface StyleDelta {
  prop: string;
  baseline: string;
  port: string;
}

/** Normalizes rgb/rgba so `rgb(x,y,z)` and `rgba(x,y,z,1)` compare equal. */
function normColor(v: string): string {
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return v.trim();
  const parts = m[1].split(/[ ,/]+/).map((s) => s.trim()).filter(Boolean);
  const [r, g, b, a] = parts;
  const alpha = a == null || a === "1" || a === "1.0" ? "1" : a;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Diffs two computed-style snapshots with px/color/transform/opacity tolerance (§8). */
export function diffStyles(
  a: Record<string, string>,
  b: Record<string, string>,
  tol: { px?: number; num?: number } = {},
): StyleDelta[] {
  const px = tol.px ?? 1.0;
  const num = tol.num ?? 0.01;
  const deltas: StyleDelta[] = [];
  for (const k of Object.keys(a)) {
    const av = a[k] ?? "";
    const bv = b[k] ?? "";
    if (av === bv) continue;

    // px lengths within tolerance
    const an = parseFloat(av);
    const bn = parseFloat(bv);
    if (Number.isFinite(an) && Number.isFinite(bn) && /px$/.test(av) && /px$/.test(bv)) {
      if (Math.abs(an - bn) <= px) continue;
    }
    // unitless numerics (opacity, flexGrow) within small tolerance
    if (Number.isFinite(an) && Number.isFinite(bn) && av === String(an) && bv === String(bn)) {
      if (Math.abs(an - bn) <= num) continue;
    }
    // color formats
    if (normColor(av) === normColor(bv)) continue;

    deltas.push({ prop: k, baseline: av, port: bv });
  }
  return deltas;
}
