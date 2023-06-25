import { Color, ColorPresentation } from "vscode-languageserver";

import { RgbaColor, colord } from "colord";

const getColorPresentations = (color: Color): ColorPresentation[] => {
  const presentations: ColorPresentation[] = [];
  const rgba: RgbaColor = {
    r: color.red * 255,
    g: color.green * 255,
    b: color.blue * 255,
    a: color.alpha,
  };
  const c = colord(rgba);
  const hex = c.toHex();
  const rbga = c.toRgb();
  const hsla = c.toHsl();
  const hexLabel = hex.toUpperCase();
  const rgbLabel =
    rbga.a < 1
      ? `rgb(${rbga.r} ${rbga.g} ${rbga.b} / ${rgba.a * 100}%)`
      : `rgb(${rbga.r} ${rbga.g} ${rbga.b})`;
  const hslLabel =
    hsla.a < 1
      ? `hsl(${hsla.h} ${hsla.s}% ${hsla.l}% / ${hsla.a * 100}%)`
      : `hsl(${hsla.h} ${hsla.s}% ${hsla.l}%)`;
  presentations.push({ label: hexLabel });
  presentations.push({ label: rgbLabel });
  presentations.push({ label: hslLabel });
  return presentations;
};

export default getColorPresentations;
