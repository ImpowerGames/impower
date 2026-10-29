import { own } from "./own";
import type { MorphColor } from "./types";

export type ReadColor = { kind: "color"; color: MorphColor } | { kind: "current" } | { kind: "none" };

const NAMED: Record<string, number> = {
  aliceblue: 0xf0f8ff,
  antiquewhite: 0xfaebd7,
  aqua: 0x00ffff,
  aquamarine: 0x7fffd4,
  azure: 0xf0ffff,
  beige: 0xf5f5dc,
  bisque: 0xffe4c4,
  black: 0x000000,
  blanchedalmond: 0xffebcd,
  blue: 0x0000ff,
  blueviolet: 0x8a2be2,
  brown: 0xa52a2a,
  burlywood: 0xdeb887,
  cadetblue: 0x5f9ea0,
  chartreuse: 0x7fff00,
  chocolate: 0xd2691e,
  coral: 0xff7f50,
  cornflowerblue: 0x6495ed,
  cornsilk: 0xfff8dc,
  crimson: 0xdc143c,
  cyan: 0x00ffff,
  darkblue: 0x00008b,
  darkcyan: 0x008b8b,
  darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9,
  darkgreen: 0x006400,
  darkgrey: 0xa9a9a9,
  darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b,
  darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00,
  darkorchid: 0x9932cc,
  darkred: 0x8b0000,
  darksalmon: 0xe9967a,
  darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f,
  darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3,
  deeppink: 0xff1493,
  deepskyblue: 0x00bfff,
  dimgray: 0x696969,
  dimgrey: 0x696969,
  dodgerblue: 0x1e90ff,
  firebrick: 0xb22222,
  floralwhite: 0xfffaf0,
  forestgreen: 0x228b22,
  fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc,
  ghostwhite: 0xf8f8ff,
  gold: 0xffd700,
  goldenrod: 0xdaa520,
  gray: 0x808080,
  green: 0x008000,
  greenyellow: 0xadff2f,
  grey: 0x808080,
  honeydew: 0xf0fff0,
  hotpink: 0xff69b4,
  indianred: 0xcd5c5c,
  indigo: 0x4b0082,
  ivory: 0xfffff0,
  khaki: 0xf0e68c,
  lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5,
  lawngreen: 0x7cfc00,
  lemonchiffon: 0xfffacd,
  lightblue: 0xadd8e6,
  lightcoral: 0xf08080,
  lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2,
  lightgray: 0xd3d3d3,
  lightgreen: 0x90ee90,
  lightgrey: 0xd3d3d3,
  lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa,
  lightskyblue: 0x87cefa,
  lightslategray: 0x778899,
  lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de,
  lightyellow: 0xffffe0,
  lime: 0x00ff00,
  limegreen: 0x32cd32,
  linen: 0xfaf0e6,
  magenta: 0xff00ff,
  maroon: 0x800000,
  mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd,
  mediumorchid: 0xba55d3,
  mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee,
  mediumspringgreen: 0x00fa9a,
  mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585,
  midnightblue: 0x191970,
  mintcream: 0xf5fffa,
  mistyrose: 0xffe4e1,
  moccasin: 0xffe4b5,
  navajowhite: 0xffdead,
  navy: 0x000080,
  oldlace: 0xfdf5e6,
  olive: 0x808000,
  olivedrab: 0x6b8e23,
  orange: 0xffa500,
  orangered: 0xff4500,
  orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa,
  palegreen: 0x98fb98,
  paleturquoise: 0xafeeee,
  palevioletred: 0xdb7093,
  papayawhip: 0xffefd5,
  peachpuff: 0xffdab9,
  peru: 0xcd853f,
  pink: 0xffc0cb,
  plum: 0xdda0dd,
  powderblue: 0xb0e0e6,
  purple: 0x800080,
  rebeccapurple: 0x663399,
  red: 0xff0000,
  rosybrown: 0xbc8f8f,
  royalblue: 0x4169e1,
  saddlebrown: 0x8b4513,
  salmon: 0xfa8072,
  sandybrown: 0xf4a460,
  seagreen: 0x2e8b57,
  seashell: 0xfff5ee,
  sienna: 0xa0522d,
  silver: 0xc0c0c0,
  skyblue: 0x87ceeb,
  slateblue: 0x6a5acd,
  slategray: 0x708090,
  slategrey: 0x708090,
  snow: 0xfffafa,
  springgreen: 0x00ff7f,
  steelblue: 0x4682b4,
  tan: 0xd2b48c,
  teal: 0x008080,
  thistle: 0xd8bfd8,
  tomato: 0xff6347,
  turquoise: 0x40e0d0,
  violet: 0xee82ee,
  wheat: 0xf5deb3,
  white: 0xffffff,
  whitesmoke: 0xf5f5f5,
  yellow: 0xffff00,
  yellowgreen: 0x9acd32,
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const cssTrim = (text: string) => text.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, "");

const OUTSIDE = /[^ \t\n\r\fA-Za-z0-9#%().,+\-/]/;

const NUMBER = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?$/i;

const component = (text: string, scale: number): number | undefined => {
  const percent = text.endsWith("%");
  const body = percent ? text.slice(0, -1) : text;
  if (!NUMBER.test(body)) return undefined;
  const n = Number(body);
  if (!Number.isFinite(n)) return undefined;
  return percent ? (n / 100) * scale : n;
};

export const readAlpha = (text: string): number | undefined => {
  if (OUTSIDE.test(text)) return undefined;
  const n = component(cssTrim(text), 1);
  return n === undefined ? undefined : clamp(n, 0, 1);
};

const ANGLE_UNITS: Record<string, number> = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };

const hue = (text: string): number | undefined => {
  const match = /^(.*?)(deg|grad|rad|turn)?$/i.exec(text);
  if (!match || !NUMBER.test(match[1]!)) return undefined;
  const degrees = Number(match[1]) * ANGLE_UNITS[(match[2] ?? "deg").toLowerCase()]!;
  return Number.isFinite(degrees) ? degrees : undefined;
};

const argumentsOf = (body: string): { parts: string[]; legacy: boolean } | undefined => {
  const text = cssTrim(body);
  if (text.includes(",")) {
    const parts = text.split(",").map(cssTrim);
    return parts.every(Boolean) && (parts.length === 3 || parts.length === 4) ? { parts, legacy: true } : undefined;
  }
  const [main, alpha, ...rest] = text.split("/");
  if (rest.length) return undefined;
  const parts = cssTrim(main!).split(/[ \t\n\r\f]+/).filter(Boolean);
  if (parts.length !== 3) return undefined;
  if (alpha === undefined) return { parts, legacy: false };
  return cssTrim(alpha) ? { parts: [...parts, cssTrim(alpha)], legacy: false } : undefined;
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};

export function readColor(value: string): ReadColor | undefined {
  if (OUTSIDE.test(value)) return undefined;
  const text = cssTrim(value).toLowerCase();
  if (text === "none") return { kind: "none" };
  if (text === "currentcolor") return { kind: "current" };
  if (text === "transparent") return { kind: "color", color: [0, 0, 0, 0] };
  const named = own(NAMED, text);
  if (named !== undefined) return { kind: "color", color: [(named >> 16) & 255, (named >> 8) & 255, named & 255, 1] };
  if (text.startsWith("#")) {
    const hex = text.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return undefined;
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a = "f"] = hex.split("");
      return { kind: "color", color: [parseInt(r! + r!, 16), parseInt(g! + g!, 16), parseInt(b! + b!, 16), parseInt(a + a, 16) / 255] };
    }
    if (hex.length === 6 || hex.length === 8) {
      const at = (i: number) => parseInt(hex.slice(i, i + 2), 16);
      return { kind: "color", color: [at(0), at(2), at(4), hex.length === 8 ? at(6) / 255 : 1] };
    }
    return undefined;
  }
  const call = /^(rgba?|hsla?)\(([\s\S]*)\)$/.exec(text);
  if (!call) return undefined;
  const parsed = argumentsOf(call[2]!);
  if (!parsed) return undefined;
  const { parts: args, legacy } = parsed;
  const or = <T>(text: string, read: (text: string) => T | undefined): T | 0 | undefined =>
    !legacy && text === "none" ? 0 : read(text);
  const alpha = args[3] === undefined ? 1 : or(args[3], readAlpha);
  if (alpha === undefined) return undefined;
  if (call[1]!.startsWith("rgb")) {
    const percents = args.slice(0, 3).filter((a) => a.endsWith("%")).length;
    if (legacy && percents !== 0 && percents !== 3) return undefined;
    const channels = args.slice(0, 3).map((a) => or(a, (t) => component(t, 255)));
    if (channels.some((c) => c === undefined)) return undefined;
    const [r, g, b] = channels.map((c) => clamp(c!, 0, 255));
    return { kind: "color", color: [r!, g!, b!, alpha] };
  }
  const percent = (text: string) => (legacy && !text.endsWith("%") ? undefined : component(text.endsWith("%") ? text : `${text}%`, 1));
  const h = or(args[0]!, hue);
  const s = or(args[1]!, percent);
  const l = or(args[2]!, percent);
  if (h === undefined || s === undefined || l === undefined) return undefined;
  const [r, g, b] = hslToRgb(((h % 360) + 360) % 360, clamp(s, 0, 1), clamp(l, 0, 1));
  return { kind: "color", color: [r, g, b, alpha] };
}

export function readEntryColor(value: unknown): MorphColor | undefined {
  if (typeof value !== "string") return undefined;
  const read = readColor(value);
  return read?.kind === "color" ? read.color : undefined;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function blendColor(from: MorphColor, to: MorphColor, t: number): MorphColor {
  const alpha = lerp(from[3], to[3], t);
  if (alpha <= 0) return [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t), 0];
  const channel = (i: number) => lerp(from[i]! * from[3], to[i]! * to[3], t) / alpha;
  return [channel(0), channel(1), channel(2), alpha];
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000 || 0);

export const formatColor = ([r, g, b, a]: MorphColor): string =>
  `rgba(${Math.round(clamp(r, 0, 255))},${Math.round(clamp(g, 0, 255))},${Math.round(clamp(b, 0, 255))},${fmt(clamp(a, 0, 1))})`;
