import tinycolor from "tinycolor2";
import {
  HSLColor,
  HSLAColor,
  RGBColor,
  RGBAColor,
  HSVColor,
  HSVAColor,
} from "../types/formats";

const getColorRgbString = (
  value:
    | string
    | HSLColor
    | HSLAColor
    | RGBColor
    | RGBAColor
    | HSVColor
    | HSVAColor
    | undefined
): string => {
  const tc = tinycolor(value);
  return tc.toRgbString();
};

export default getColorRgbString;
