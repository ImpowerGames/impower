export interface AlphaColor {
  a: number;
}

export const isAlphaColor = (obj: unknown): obj is AlphaColor => {
  if (!obj) {
    return false;
  }
  const color = obj as AlphaColor;
  return color.a !== undefined;
};

export interface HSVColor {
  h: number;
  s: number;
  v: number;
}

export const isHSVColor = (obj: unknown): obj is HSVColor => {
  if (!obj) {
    return false;
  }
  const color = obj as HSVColor;
  return (
    color.h !== undefined && color.s !== undefined && color.v !== undefined
  );
};

export interface HSVAColor extends HSVColor, AlphaColor {}

export const isHSVAColor = (obj: unknown): obj is HSVColor => {
  if (!obj) {
    return false;
  }
  const color = obj as HSVAColor;
  return (
    color.h !== undefined && color.s !== undefined && color.v !== undefined
  );
};

export interface HSLColor {
  h: number;
  s: number;
  l: number;
}

export const isHSLColor = (obj: unknown): obj is HSLColor => {
  if (!obj) {
    return false;
  }
  const color = obj as HSLColor;
  return (
    color.h !== undefined && color.s !== undefined && color.l !== undefined
  );
};

export interface HSLAColor extends HSLColor, AlphaColor {}

export const isHSLAColor = (obj: unknown): obj is HSLAColor => {
  if (!obj) {
    return false;
  }
  const color = obj as HSLAColor;
  return (
    color.h !== undefined &&
    color.s !== undefined &&
    color.l !== undefined &&
    color.a !== undefined
  );
};

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export const isRGBColor = (obj: unknown): obj is RGBColor => {
  if (!obj) {
    return false;
  }
  const color = obj as RGBColor;
  return (
    color.r !== undefined && color.g !== undefined && color.b !== undefined
  );
};

export interface RGBAColor extends RGBColor, AlphaColor {}

export const isRGBAColor = (obj: unknown): obj is RGBAColor => {
  if (!obj) {
    return false;
  }
  const color = obj as RGBAColor;
  return (
    color.r !== undefined &&
    color.g !== undefined &&
    color.b !== undefined &&
    color.a !== undefined
  );
};

export interface ColorResult {
  hex: string;
  hsla: HSLAColor;
  rgba: RGBAColor;
}
