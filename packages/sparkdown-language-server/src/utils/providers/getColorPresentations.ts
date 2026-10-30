import { type RgbaColor, colord } from "colord";
import { type Color, type ColorPresentation } from "vscode-languageserver";

export const getColorPresentations = (color: Color): ColorPresentation[] => {
  const presentations: ColorPresentation[] = [];

  const rgba: RgbaColor = {
    r: Math.round(color.red * 255),
    g: Math.round(color.green * 255),
    b: Math.round(color.blue * 255),
    a: Number(color.alpha.toFixed(3)),
  };

  const c = colord(rgba);
  const rgb = c.toRgb();
  const hsl = c.toHsl();

  const a = rgba.a;

  const alphaSlashPercentage = a === 1 ? "" : ` / ${Math.round(a * 100)}%`;

  presentations.push({ label: c.toHex().toLowerCase() });
  presentations.push({ label: c.toHex().toUpperCase() });

  presentations.push({
    label: `rgb(${rgb.r} ${rgb.g} ${rgb.b}${alphaSlashPercentage})`,
  });
  if (a === 1) {
    presentations.push({ label: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` });
  } else {
    presentations.push({ label: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})` });
  }

  presentations.push({
    label: `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%${alphaSlashPercentage})`,
  });
  if (a === 1) {
    presentations.push({ label: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` });
  } else {
    presentations.push({ label: `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${a})` });
  }

  return presentations;
};
