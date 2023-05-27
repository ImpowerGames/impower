import tinycolor from "tinycolor2";
import {
  HSLColor,
  HSLAColor,
  RGBColor,
  RGBAColor,
  HSVColor,
  HSVAColor,
} from "../types/formats";

const getColorHex = (
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
  return `#${tc.toHex8().toUpperCase()}`;
};

export default getColorHex;
