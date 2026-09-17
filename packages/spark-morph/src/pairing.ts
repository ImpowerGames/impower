import { dist } from "./geometry/cubic";
import type { Point, Subpath } from "./types";

/** A drawing with its resolved effective label and a stable identity. */
export interface LabelledShape {
  id: string;
  /** The effective label; an empty string never pairs. */
  label: string;
  subpaths: Subpath[];
}

export interface ShapePair {
  /**
   * Stable across direction: the same two shapes give the same id whether
   * the morph runs forward or in reverse, and a shape shared by several
   * pairs appears in each with its own id.
   */
  trackId: string;
  from: LabelledShape;
  to: LabelledShape;
  /** True when the pair's `from` or `to` is shared with another pair. */
  shared: boolean;
}

export type UnpairedReason = "empty-label" | "no-counterpart" | "count-mismatch";

export interface UnpairedShape {
  side: "from" | "to";
  shape: LabelledShape;
  reason: UnpairedReason;
}

export interface PairingDiagnostic {
  label: string;
  fromCount: number;
  toCount: number;
  message: string;
}

export interface PairingResult {
  pairs: ShapePair[];
  unpaired: UnpairedShape[];
  diagnostics: PairingDiagnostic[];
}

/** The mean of segment start points across the drawing: its pairing position. */
export function shapePosition(shape: LabelledShape): Point {
  let x = 0,
    y = 0,
    n = 0;
  for (const s of shape.subpaths) {
    for (const seg of s.segments) {
      x += seg.p0[0];
      y += seg.p0[1];
      n++;
    }
  }
  return n ? [x / n, y / n] : [0, 0];
}

export const trackIdFor = (a: LabelledShape, b: LabelledShape): string => [a.id, b.id].sort().join("<>");

/**
 * Pairs shapes by identical nonempty label. One-to-many pairs when one side
 * has a single shape; equal counts pair by nearest position, greedily in
 * ascending distance with index order breaking ties; unequal counts with
 * neither side single leave every shape of that label unpaired with a
 * diagnostic.
 */
export function pairShapes(from: LabelledShape[], to: LabelledShape[]): PairingResult {
  const pairs: ShapePair[] = [];
  const unpaired: UnpairedShape[] = [];
  const diagnostics: PairingDiagnostic[] = [];
  const byLabel = (shapes: LabelledShape[]) => {
    const map = new Map<string, LabelledShape[]>();
    for (const s of shapes) {
      if (!s.label) continue;
      const list = map.get(s.label);
      if (list) list.push(s);
      else map.set(s.label, [s]);
    }
    return map;
  };
  for (const s of from) if (!s.label) unpaired.push({ side: "from", shape: s, reason: "empty-label" });
  for (const s of to) if (!s.label) unpaired.push({ side: "to", shape: s, reason: "empty-label" });
  const fromMap = byLabel(from),
    toMap = byLabel(to);
  const labels = [...new Set([...fromMap.keys(), ...toMap.keys()])];
  for (const label of labels) {
    const F = fromMap.get(label) ?? [],
      T = toMap.get(label) ?? [];
    if (!F.length || !T.length) {
      for (const s of F) unpaired.push({ side: "from", shape: s, reason: "no-counterpart" });
      for (const s of T) unpaired.push({ side: "to", shape: s, reason: "no-counterpart" });
      continue;
    }
    if (F.length === 1 || T.length === 1) {
      const shared = F.length > 1 || T.length > 1;
      for (const f of F) for (const t of T) pairs.push({ trackId: trackIdFor(f, t), from: f, to: t, shared });
      continue;
    }
    if (F.length !== T.length) {
      for (const s of F) unpaired.push({ side: "from", shape: s, reason: "count-mismatch" });
      for (const s of T) unpaired.push({ side: "to", shape: s, reason: "count-mismatch" });
      diagnostics.push({
        label,
        fromCount: F.length,
        toCount: T.length,
        message: `label "${label}" has ${F.length} shapes before and ${T.length} after; only equal counts or a single shape on one side pair`,
      });
      continue;
    }
    const pf = F.map(shapePosition),
      pt = T.map(shapePosition);
    const edges: { d: number; i: number; j: number }[] = [];
    for (let i = 0; i < F.length; i++) for (let j = 0; j < T.length; j++) edges.push({ d: dist(pf[i]!, pt[j]!), i, j });
    edges.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
    const usedF = new Set<number>(),
      usedT = new Set<number>();
    for (const e of edges) {
      if (usedF.has(e.i) || usedT.has(e.j)) continue;
      usedF.add(e.i);
      usedT.add(e.j);
      pairs.push({ trackId: trackIdFor(F[e.i]!, T[e.j]!), from: F[e.i]!, to: T[e.j]!, shared: false });
    }
  }
  return { pairs, unpaired, diagnostics };
}
