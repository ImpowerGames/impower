import tinycolor from "tinycolor2";
import { Color } from "../types/interfaces/color";

const overlayColor = (
  foregroundColor: Color | string,
  backgroundColor: Color | string,
  opacity = 0.5
): Color => {
  const f = tinycolor(foregroundColor).toRgb();
  const b = tinycolor(backgroundColor).toRgb();
  const fo = { r: opacity * f.r, g: opacity * f.g, b: opacity * f.b };
  const bo = {
    r: (1 - opacity) * b.r,
    g: (1 - opacity) * b.g,
    b: (1 - opacity) * b.b,
  };
  return tinycolor({ r: fo.r + bo.r, g: fo.g + bo.g, b: fo.b + bo.b }).toHsl();
};

export default overlayColor;
