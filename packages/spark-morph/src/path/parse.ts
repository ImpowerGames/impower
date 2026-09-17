import type { Cubic, Point, Subpath } from "../types";

interface Token {
  cmd: string;
  args: number[];
}

const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y;
const COMMAND = /[MmLlHhVvCcSsQqTtAaZz]/y;
const SEPARATOR = /[\s,]*/y;

/**
 * Splits path data into commands with their numeric arguments. Numbers may
 * run together as SVG allows (`1.5.3`, `1-2`, `1e3`), and separators are any
 * whitespace or comma. The fourth and fifth arguments of every arc are
 * single-character flags, so `0110,10` reads as flags `0` and `1` followed
 * by `10,10`, as compact SVG writes it.
 */
function tokenize(d: string): Token[] {
  const out: Token[] = [];
  let cur: Token | null = null;
  let i = 0;
  while (i < d.length) {
    SEPARATOR.lastIndex = i;
    SEPARATOR.exec(d);
    i = SEPARATOR.lastIndex;
    if (i >= d.length) break;
    COMMAND.lastIndex = i;
    const c = COMMAND.exec(d);
    if (c) {
      cur = { cmd: c[0], args: [] };
      out.push(cur);
      i = COMMAND.lastIndex;
      continue;
    }
    if (cur && (cur.cmd === "A" || cur.cmd === "a")) {
      const slot = cur.args.length % 7;
      if ((slot === 3 || slot === 4) && (d[i] === "0" || d[i] === "1")) {
        cur.args.push(Number(d[i]));
        i++;
        continue;
      }
    }
    NUMBER.lastIndex = i;
    const n = NUMBER.exec(d);
    if (!n || NUMBER.lastIndex === i) {
      // Unparseable character: skip it rather than loop forever.
      i++;
      continue;
    }
    if (cur) cur.args.push(parseFloat(n[0]));
    i = NUMBER.lastIndex;
  }
  return out;
}

/**
 * Converts one elliptical arc to cubics using the SVG endpoint-to-centre
 * conversion, splitting into sweeps of at most 90 degrees.
 */
export function arcToCubics(
  p0: Point,
  rx: number,
  ry: number,
  phiDeg: number,
  largeArc: number,
  sweep: number,
  p1: Point,
): Cubic[] {
  // The SVG rule: an arc whose endpoints coincide is omitted entirely, and
  // an arc with a zero radius is a straight line.
  if (p0[0] === p1[0] && p0[1] === p1[1]) return [];
  if (rx === 0 || ry === 0) return [{ p0, c1: p0, c2: p1, p1 }];
  const phi = (phiDeg * Math.PI) / 180;
  const cosP = Math.cos(phi),
    sinP = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2,
    dy = (p0[1] - p1[1]) / 2;
  const x1p = cosP * dx + sinP * dy,
    y1p = -sinP * dx + cosP * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }
  const sign = largeArc === sweep ? -1 : 1;
  let num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  num = Math.max(0, num);
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = den === 0 ? 0 : sign * Math.sqrt(num / den);
  const cxp = (co * rx * y1p) / ry,
    cyp = (-co * ry * x1p) / rx;
  const cx = cosP * cxp - sinP * cyp + (p0[0] + p1[0]) / 2;
  const cy = sinP * cxp + cosP * cyp + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1;
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI;
  if (sweep && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2)));
  const delta = dth / n;
  const t = (4 / 3) * Math.tan(delta / 4);
  const segs: Cubic[] = [];
  let a0 = th1,
    start = p0;
  const e = (a: number): Point => [
    cx + rx * Math.cos(a) * cosP - ry * Math.sin(a) * sinP,
    cy + rx * Math.cos(a) * sinP + ry * Math.sin(a) * cosP,
  ];
  const deriv = (a: number): Point => [
    -rx * Math.sin(a) * cosP - ry * Math.cos(a) * sinP,
    -rx * Math.sin(a) * sinP + ry * Math.cos(a) * cosP,
  ];
  for (let i = 0; i < n; i++) {
    const a1 = a0 + delta;
    const ep = i === n - 1 ? p1 : e(a1);
    const d0 = deriv(a0),
      d1 = deriv(a1);
    segs.push({
      p0: start,
      c1: [start[0] + t * d0[0], start[1] + t * d0[1]],
      c2: [ep[0] - t * d1[0], ep[1] - t * d1[1]],
      p1: ep,
    });
    start = ep;
    a0 = a1;
  }
  return segs;
}

/**
 * Parses SVG path data into subpaths of absolute cubic segments. Lines,
 * quadratics, smooth variants, and arcs are all promoted to cubics. A
 * subpath with no drawing command after its move is dropped.
 */
export function parsePathData(d: string): Subpath[] {
  const toks = tokenize(d);
  const subs: Subpath[] = [];
  let cur: Cubic[] = [];
  let closed = false;
  let pos: Point = [0, 0],
    startPt: Point = [0, 0],
    prevC2: Point | null = null,
    prevQ: Point | null = null;
  const flush = () => {
    if (cur.length) subs.push({ segments: cur, closed });
    cur = [];
    closed = false;
  };
  const line = (to: Point) => {
    cur.push({ p0: [pos[0], pos[1]], c1: [pos[0], pos[1]], c2: [to[0], to[1]], p1: [to[0], to[1]] });
    pos = to;
    prevC2 = prevQ = null;
  };
  const quad = (c: Point, to: Point) => {
    const c1: Point = [pos[0] + (2 / 3) * (c[0] - pos[0]), pos[1] + (2 / 3) * (c[1] - pos[1])];
    const c2: Point = [to[0] + (2 / 3) * (c[0] - to[0]), to[1] + (2 / 3) * (c[1] - to[1])];
    cur.push({ p0: [pos[0], pos[1]], c1, c2, p1: [to[0], to[1]] });
    prevQ = c;
    pos = to;
    prevC2 = null;
  };
  for (const { cmd, args } of toks) {
    const rel = cmd === cmd.toLowerCase();
    const A = (i: number): Point =>
      rel ? [pos[0] + args[i]!, pos[1] + args[i + 1]!] : [args[i]!, args[i + 1]!];
    switch (cmd.toUpperCase()) {
      case "M": {
        flush();
        if (args.length < 2) break;
        const to = A(0);
        pos = to;
        startPt = [to[0], to[1]];
        prevC2 = prevQ = null;
        for (let i = 2; i + 1 < args.length; i += 2) line(A(i));
        break;
      }
      case "L":
        for (let i = 0; i + 1 < args.length; i += 2) line(A(i));
        break;
      case "H":
        for (const x of args) line([rel ? pos[0] + x : x, pos[1]]);
        break;
      case "V":
        for (const y of args) line([pos[0], rel ? pos[1] + y : y]);
        break;
      case "C":
        for (let i = 0; i + 5 < args.length; i += 6) {
          const c1 = A(i),
            c2 = A(i + 2),
            to = A(i + 4);
          cur.push({ p0: [pos[0], pos[1]], c1, c2, p1: [to[0], to[1]] });
          prevC2 = c2;
          pos = to;
          prevQ = null;
        }
        break;
      case "S":
        for (let i = 0; i + 3 < args.length; i += 4) {
          const c1: Point = prevC2 ? [2 * pos[0] - prevC2[0], 2 * pos[1] - prevC2[1]] : [pos[0], pos[1]];
          const c2 = A(i),
            to = A(i + 2);
          cur.push({ p0: [pos[0], pos[1]], c1, c2, p1: [to[0], to[1]] });
          prevC2 = c2;
          pos = to;
          prevQ = null;
        }
        break;
      case "Q":
        for (let i = 0; i + 3 < args.length; i += 4) quad(A(i), A(i + 2));
        break;
      case "T":
        for (let i = 0; i + 1 < args.length; i += 2) {
          const c: Point = prevQ ? [2 * pos[0] - prevQ[0], 2 * pos[1] - prevQ[1]] : [pos[0], pos[1]];
          quad(c, A(i));
        }
        break;
      case "A":
        for (let i = 0; i + 6 < args.length; i += 7) {
          const to: Point = rel
            ? [pos[0] + args[i + 5]!, pos[1] + args[i + 6]!]
            : [args[i + 5]!, args[i + 6]!];
          for (const seg of arcToCubics(pos, args[i]!, args[i + 1]!, args[i + 2]!, args[i + 3]!, args[i + 4]!, to)) {
            cur.push(seg);
          }
          pos = to;
          prevC2 = prevQ = null;
        }
        break;
      case "Z":
        if (pos[0] !== startPt[0] || pos[1] !== startPt[1]) line([startPt[0], startPt[1]]);
        closed = true;
        pos = [startPt[0], startPt[1]];
        // A drawing command after Z without a new M starts at the same point.
        if (cur.length) subs.push({ segments: cur, closed });
        cur = [];
        closed = false;
        break;
    }
  }
  flush();
  return subs;
}
