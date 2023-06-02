import tinycolor from "tinycolor2";
import { Color } from "../types/interfaces/color";

const getReadableForegroundColor = (
  foregroundColor: Color | string,
  backgroundColor: Color | string,
  desaturate = 0,
  changeLimit = 100,
  saturateWhileDarkening = false
): Color => {
  let newColor = tinycolor(foregroundColor);
  newColor = newColor.desaturate(newColor.toHsl().s * 100 * desaturate);
  const isDark = tinycolor(backgroundColor).isDark();
  while (!tinycolor.isReadable(newColor, backgroundColor) && changeLimit >= 0) {
    if (isDark) {
      newColor = newColor.lighten(1);
    } else if (saturateWhileDarkening) {
      newColor = newColor.darken(1).saturate(1);
    } else {
      newColor = newColor.darken(1);
    }
    changeLimit -= 1;
  }
  return newColor.toHsl();
};

export default getReadableForegroundColor;
