export type Matrix2D = readonly [number, number, number, number, number, number];

export interface MotionPose {
  matrix: Matrix2D;
  opacity: number;
}

export interface MotionStyle {
  translate: string;
  rotate: string;
  scale: string;
  transform: string;
  transformOrigin: string;
  opacity: string;
}

export interface MotionBox {
  width: number;
  height: number;
}

export const IDENTITY: Matrix2D = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix2D, n: Matrix2D): Matrix2D {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

const translation = (x: number, y: number): Matrix2D => [1, 0, 0, 1, x, y];

const ANGLE: Record<string, number> = { deg: Math.PI / 180, rad: 1, grad: Math.PI / 200, turn: Math.PI * 2 };

function splitWords(text: string): string[] {
  const words: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text.trim()) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (depth === 0 && /\s/.test(ch)) {
      if (current) words.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) words.push(current);
  return words;
}

type Unit = (unit: string) => number | undefined;

function evaluate(text: string, unit: Unit): number | undefined {
  let i = 0;
  const source = text.replace(/\s+/g, " ");
  const space = () => {
    while (source[i] === " ") i += 1;
  };
  const primary = (): number | undefined => {
    space();
    if (source.startsWith("calc(", i)) {
      i += 5;
      const value = sum();
      space();
      if (source[i] !== ")") return undefined;
      i += 1;
      return value;
    }
    if (source[i] === "(") {
      i += 1;
      const value = sum();
      space();
      if (source[i] !== ")") return undefined;
      i += 1;
      return value;
    }
    const match = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?([a-z]+|%)?/i.exec(source.slice(i));
    if (!match) return undefined;
    i += match[0].length;
    const factor = unit((match[1] ?? "").toLowerCase());
    return factor === undefined ? undefined : Number.parseFloat(match[0]) * factor;
  };
  const product = (): number | undefined => {
    let value = primary();
    for (;;) {
      space();
      const op = source[i];
      if (value === undefined || (op !== "*" && op !== "/")) return value;
      i += 1;
      const next = primary();
      if (next === undefined) return undefined;
      value = op === "*" ? value * next : value / next;
    }
  };
  const sum = (): number | undefined => {
    let value = product();
    for (;;) {
      space();
      const op = source[i];
      if (value === undefined || (op !== "+" && op !== "-")) return value;
      i += 1;
      const next = product();
      if (next === undefined) return undefined;
      value = op === "+" ? value + next : value - next;
    }
  };
  const value = sum();
  space();
  return i === source.length && value !== undefined && Number.isFinite(value) ? value : undefined;
}

const length = (text: string, reference: number) =>
  evaluate(text, (unit) => (unit === "px" || unit === "" ? 1 : unit === "%" ? reference / 100 : undefined));

const angle = (text: string) => evaluate(text, (unit) => (unit === "" ? 0 : ANGLE[unit]));

const factor = (text: string) => evaluate(text, (unit) => (unit === "" ? 1 : unit === "%" ? 0.01 : undefined));

const none = (text: string) => {
  const value = text.trim().toLowerCase();
  return value === "" || value === "none";
};

function translateMatrix(text: string, box: MotionBox): Matrix2D | undefined {
  if (none(text)) return IDENTITY;
  const [x, y] = splitWords(text);
  const dx = x === undefined ? undefined : length(x, box.width);
  const dy = y === undefined ? 0 : length(y, box.height);
  return dx === undefined || dy === undefined ? undefined : translation(dx, dy);
}

function rotateMatrix(text: string): Matrix2D | undefined {
  if (none(text)) return IDENTITY;
  const words = splitWords(text);
  const turn = angle(words.at(-1) ?? "");
  if (turn === undefined) return undefined;
  const axis = words.slice(0, -1).map((word) => word.toLowerCase());
  let sign = 1;
  if (axis.length === 3) {
    const [ax, ay, az] = axis.map(Number);
    if (ax !== 0 || ay !== 0 || !az) return undefined;
    sign = Math.sign(az);
  } else if (axis.length === 1) {
    if (axis[0] !== "z") return undefined;
  } else if (axis.length !== 0) {
    return undefined;
  }
  const radians = turn * sign;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, sin, -sin, cos, 0, 0];
}

function scaleMatrix(text: string): Matrix2D | undefined {
  if (none(text)) return IDENTITY;
  const [x, y] = splitWords(text);
  const sx = x === undefined ? undefined : factor(x);
  const sy = y === undefined ? sx : factor(y);
  return sx === undefined || sy === undefined ? undefined : [sx, 0, 0, sy, 0, 0];
}

function transformMatrix(text: string, box: MotionBox): Matrix2D | undefined {
  if (none(text)) return IDENTITY;
  const match = /^\s*(matrix|matrix3d)\(([^)]*)\)\s*$/i.exec(text);
  if (!match) return transformList(text, box);
  const values = match[2]!.split(",").map((value) => Number(value.trim()));
  if (values.some((value) => !Number.isFinite(value))) return undefined;
  if (match[1]!.toLowerCase() === "matrix") return values.length === 6 ? (values as unknown as Matrix2D) : undefined;
  if (values.length !== 16) return undefined;
  return [values[0]!, values[1]!, values[4]!, values[5]!, values[12]!, values[13]!];
}

function transformList(text: string, box: MotionBox): Matrix2D | undefined {
  let matrix = IDENTITY;
  for (const word of splitWords(text)) {
    const match = /^([a-z0-9]+)\((.*)\)$/i.exec(word);
    if (!match) return undefined;
    const name = match[1]!.toLowerCase();
    const args = match[2]!.split(",").map((arg) => arg.trim());
    let step: Matrix2D | undefined;
    if (name === "translate" || name === "translatex" || name === "translatey") {
      const x = name === "translatey" ? "0px" : args[0]!;
      const y = name === "translatex" ? "0px" : name === "translatey" ? args[0]! : (args[1] ?? "0px");
      const dx = length(x, box.width);
      const dy = length(y, box.height);
      step = dx === undefined || dy === undefined ? undefined : translation(dx, dy);
    } else if (name === "scale" || name === "scalex" || name === "scaley") {
      const x = name === "scaley" ? "1" : args[0]!;
      const y = name === "scalex" ? "1" : name === "scaley" ? args[0]! : (args[1] ?? args[0]!);
      step = scaleMatrix(`${x} ${y}`);
    } else if (name === "rotate") {
      step = rotateMatrix(args[0]!);
    } else if (name === "skew" || name === "skewx" || name === "skewy") {
      const ax = angle(name === "skewy" ? "0" : args[0]!);
      const ay = angle(name === "skewx" ? "0" : name === "skewy" ? args[0]! : (args[1] ?? "0"));
      step = ax === undefined || ay === undefined ? undefined : [1, Math.tan(ay), Math.tan(ax), 1, 0, 0];
    } else if (name === "matrix") {
      step = transformMatrix(word, box);
    }
    if (!step) return undefined;
    matrix = multiply(matrix, step);
  }
  return matrix;
}

function originOf(text: string, box: MotionBox): [number, number] | undefined {
  const words = splitWords(text);
  if (words.length === 0) return [box.width / 2, box.height / 2];
  const keyword = (word: string, axis: "x" | "y") => {
    const value = word.toLowerCase();
    const size = axis === "x" ? box.width : box.height;
    if (value === "center") return size / 2;
    if ((axis === "x" && value === "left") || (axis === "y" && value === "top")) return 0;
    if ((axis === "x" && value === "right") || (axis === "y" && value === "bottom")) return size;
    return length(word, size);
  };
  const x = keyword(words[0]!, "x");
  const y = words[1] === undefined ? box.height / 2 : keyword(words[1], "y");
  return x === undefined || y === undefined ? undefined : [x, y];
}

export function motionPose(style: MotionStyle, box: MotionBox): MotionPose | undefined {
  const origin = originOf(style.transformOrigin, box);
  const translate = translateMatrix(style.translate, box);
  const rotate = rotateMatrix(style.rotate);
  const scale = scaleMatrix(style.scale);
  const transform = transformMatrix(style.transform, box);
  if (!origin || !translate || !rotate || !scale || !transform) return undefined;
  const opacity = style.opacity.trim() === "" ? 1 : Number(style.opacity);
  let matrix = translation(origin[0], origin[1]);
  for (const step of [translate, rotate, scale, transform, translation(-origin[0], -origin[1])]) matrix = multiply(matrix, step);
  return { matrix, opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1 };
}

export function computedMotionPose(element: Element, box: MotionBox): MotionPose | undefined {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return undefined;
  return motionPose(
    {
      translate: style.getPropertyValue("translate"),
      rotate: style.getPropertyValue("rotate"),
      scale: style.getPropertyValue("scale"),
      transform: style.getPropertyValue("transform"),
      transformOrigin: style.getPropertyValue("transform-origin"),
      opacity: style.getPropertyValue("opacity"),
    },
    box,
  );
}
