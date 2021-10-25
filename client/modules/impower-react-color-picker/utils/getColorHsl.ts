import tinycolor from "tinycolor2";
import {
  HSLColor,
  HSLAColor,
  RGBColor,
  RGBAColor,
  HSVColor,
  HSVAColor,
} from "../types/formats";

const getColorHsl = (
  value:
    | string
    | HSLColor
    | HSLAColor
    | RGBColor
    | RGBAColor
    | HSVColor
    | HSVAColor
    | undefined
): HSLAColor => {
  const tc = tinycolor(value);
  return tc.toHsl();
};

export default getColorHsl;
