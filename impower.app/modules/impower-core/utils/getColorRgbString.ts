import tinycolor from "tinycolor2";
import { Color } from "../types/interfaces/color";

const getColorRgbString = (color: Color | string): string =>
  tinycolor(color).toRgbString();

export default getColorRgbString;
