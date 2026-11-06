import type * as lsp from "vscode-languageserver-protocol";

export interface ColorValue {
  rgb: string;
  alpha: string;
}

const HEX_VALUE = /^#?(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;

const hexByte = (n: number) =>
  Math.round(Math.min(Math.max(n, 0), 255))
    .toString(16)
    .padStart(2, "0");

export function colorValueOf(text: string): ColorValue | null {
  const trimmed = text.trim();
  if (!HEX_VALUE.test(trimmed)) {
    return null;
  }
  let digits = trimmed.replace(/^#/, "").toLowerCase();
  if (digits.length <= 4) {
    digits = [...digits].map((c) => c + c).join("");
  }
  return { rgb: `#${digits.slice(0, 6)}`, alpha: digits.slice(6) };
}

export function formatColorValue(value: ColorValue, like: string): string {
  let digits = (value.rgb + value.alpha).replace(/^#/, "");
  const written = like.trim().replace(/^#/, "");
  const pairs = digits.match(/../g) ?? [];
  if (written.length <= 4 && pairs.every((pair) => pair[0] === pair[1])) {
    digits = pairs.map((pair) => pair[0]).join("");
  }
  const upper = written === written.toUpperCase() && /[A-F]/.test(written);
  return `#${upper ? digits.toUpperCase() : digits}`;
}

export function opacityOf(value: ColorValue): number {
  const alpha = value.alpha ? parseInt(value.alpha, 16) : 255;
  return Math.round((alpha / 255) * 100);
}

export function withOpacity(value: ColorValue, percent: number): ColorValue {
  return {
    rgb: value.rgb,
    alpha: percent >= 100 ? "" : hexByte((percent / 100) * 255),
  };
}

export function withColorOf(value: ColorValue, rgb: string): ColorValue {
  return { rgb: colorValueOf(rgb)?.rgb ?? value.rgb, alpha: value.alpha };
}

export function lspColorOf(value: ColorValue): lsp.Color {
  const channel = (i: number) => parseInt(value.rgb.slice(i, i + 2), 16) / 255;
  return {
    red: channel(1),
    green: channel(3),
    blue: channel(5),
    alpha: value.alpha ? parseInt(value.alpha, 16) / 255 : 1,
  };
}

export function rgbOfLspColor(color: lsp.Color): string {
  return `#${hexByte(color.red * 255)}${hexByte(color.green * 255)}${hexByte(color.blue * 255)}`;
}

export function colorValueOfLspColor(color: lsp.Color): ColorValue {
  return {
    rgb: rgbOfLspColor(color),
    alpha: color.alpha >= 1 ? "" : hexByte(color.alpha * 255),
  };
}

export function storyColors(documents: readonly (readonly lsp.Color[])[]): string[] {
  const seen = new Set<string>();
  for (const colors of documents) {
    for (const color of colors) {
      seen.add(rgbOfLspColor(color));
    }
  }
  return [...seen];
}
