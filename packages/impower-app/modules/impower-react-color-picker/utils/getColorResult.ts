import tinycolor from "tinycolor2";
import {
  HSLColor,
  HSLAColor,
  RGBColor,
  RGBAColor,
  HSVColor,
  HSVAColor,
  ColorResult,
  isHSLAColor,
  isRGBAColor,
} from "../types/formats";

const getColorResult = (
  value:
    | string
    | HSLColor
    | HSLAColor
    | RGBColor
    | RGBAColor
    | HSVColor
    | HSVAColor
    | undefined
): ColorResult => {
  const tc = tinycolor(value);
  const hex = tc.toHex8().toUpperCase();
  const hsla = isHSLAColor(value) ? value : tc.toHsl();
  const rgba = isRGBAColor(value) ? value : tc.toRgb();
  return { hex, hsla, rgba };
};

export default getColorResult;
