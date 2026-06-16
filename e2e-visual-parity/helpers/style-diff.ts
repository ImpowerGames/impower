import type { Locator } from "@playwright/test";

/** Reads a fixed set of computed-style properties from an element (§8). */
export async function readComputed(
  locator: Locator,
  props: string[],
): Promise<Record<string, string>> {
  return locator.evaluate((el, props: string[]) => {
    const cs = getComputedStyle(el as Element);
    const cssName = (p: string) => p.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    const out: Record<string, string> = {};
    for (const p of props) {
      out[p] = cs.getPropertyValue(cssName(p)) || ((cs as unknown as Record<string, string>)[p] ?? "");
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
