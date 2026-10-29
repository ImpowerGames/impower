import type { Cubic, Point, Subpath } from "@impower/spark-morph/src/index";

export type Affine = [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

export function multiply(m: Affine, n: Affine): Affine {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function invert(m: Affine): Affine | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export const isIdentity = (m: Affine): boolean =>
  m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

export const applyPoint = (m: Affine, p: Point): Point => [
  m[0] * p[0] + m[2] * p[1] + m[4],
  m[1] * p[0] + m[3] * p[1] + m[5],
];

export function applySubpaths(m: Affine, subpaths: Subpath[]): Subpath[] {
  if (isIdentity(m)) return subpaths;
  return subpaths.map((s) => ({
    closed: s.closed,
    segments: s.segments.map(
      (c): Cubic => ({
        p0: applyPoint(m, c.p0),
        c1: applyPoint(m, c.c1),
        c2: applyPoint(m, c.c2),
        p1: applyPoint(m, c.p1),
      }),
    ),
  }));
}

const NUMBER = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const WSP = /^[ \t\n\r]+|[ \t\n\r]+$/g;
const ARGUMENT_SEPARATOR = /[ \t\n\r]*,[ \t\n\r]*|[ \t\n\r]+/;
const deg = (n: number) => (n * Math.PI) / 180;

const readArguments = (text: string): number[] | null => {
  const source = text.replace(WSP, "");
  if (!source) return null;
  const args: number[] = [];
  for (const arg of source.split(ARGUMENT_SEPARATOR)) {
    const value = Number(arg);
    if (!NUMBER.test(arg) || !Number.isFinite(value)) return null;
    args.push(value);
  }
  return args;
};

export function parseTransform(text: string | undefined): Affine | null {
  if (text === undefined) return IDENTITY;
  const source = text.replace(WSP, "");
  if (!source) return IDENTITY;
  const call = /([a-zA-Z]+)[ \t\n\r]*\(([^()]*)\)/y;
  const separator = /[ \t\n\r]*,[ \t\n\r]*|[ \t\n\r]+/y;
  let m: Affine = IDENTITY;
  let at = 0;
  while (at < source.length) {
    if (at > 0) {
      separator.lastIndex = at;
      if (!separator.exec(source)) return null;
      at = separator.lastIndex;
    }
    call.lastIndex = at;
    const found = call.exec(source);
    if (!found) return null;
    at = call.lastIndex;
    const name = found[1]!;
    const args = readArguments(found[2]!);
    if (!args) return null;
    let next: Affine;
    switch (name) {
      case "matrix":
        if (args.length !== 6) return null;
        next = args as Affine;
        break;
      case "translate":
        if (args.length < 1 || args.length > 2) return null;
        next = [1, 0, 0, 1, args[0]!, args[1] ?? 0];
        break;
      case "scale":
        if (args.length < 1 || args.length > 2) return null;
        next = [args[0]!, 0, 0, args[1] ?? args[0]!, 0, 0];
        break;
      case "rotate": {
        if (args.length !== 1 && args.length !== 3) return null;
        const a = deg(args[0]!);
        const r: Affine = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
        if (args.length === 3) {
          const [cx, cy] = [args[1]!, args[2]!];
          next = multiply(multiply([1, 0, 0, 1, cx, cy], r), [1, 0, 0, 1, -cx, -cy]);
        } else {
          next = r;
        }
        break;
      }
      case "skewX":
        if (args.length !== 1) return null;
        next = [1, 0, Math.tan(deg(args[0]!)), 1, 0, 0];
        break;
      case "skewY":
        if (args.length !== 1) return null;
        next = [1, Math.tan(deg(args[0]!)), 0, 1, 0, 0];
        break;
      default:
        return null;
    }
    m = multiply(m, next);
  }
  return m.every(Number.isFinite) ? m : null;
}

const fmt = (n: number) => {
  const s = Number(n.toFixed(6));
  return Object.is(s, -0) ? "0" : String(s);
};

export const formatAffine = (m: Affine): string => `matrix(${m.map(fmt).join(" ")})`;
