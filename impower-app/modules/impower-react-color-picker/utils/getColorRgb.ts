import tinycolor from "tinycolor2";
import {
  HSLColor,
  HSLAColor,
  RGBColor,
  RGBAColor,
  HSVColor,
  HSVAColor,
} from "../types/formats";

const getColorRgb = (
  value:
    | string
    | HSLColor
    | HSLAColor
    | RGBColor
    | RGBAColor
    | HSVColor
    | HSVAColor
    | undefined
): RGBAColor => {
  const tc = tinycolor(value);
  return tc.toRgb();
};

export default getColorRgb;
