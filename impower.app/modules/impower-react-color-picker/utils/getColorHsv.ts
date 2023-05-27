import tinycolor from "tinycolor2";
import {
  HSLColor,
  HSLAColor,
  RGBColor,
  RGBAColor,
  HSVColor,
  HSVAColor,
} from "../types/formats";

const getColorHsv = (
  value:
    | string
    | HSLColor
    | HSLAColor
    | RGBColor
    | RGBAColor
    | HSVColor
    | HSVAColor
    | undefined
): HSVAColor => {
  const tc = tinycolor(value);
  return tc.toHsv();
};

export default getColorHsv;
