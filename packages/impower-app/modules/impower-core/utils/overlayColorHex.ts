import { Color } from "../types/interfaces/color";
import hslaToHex from "./hslaToHex";
import overlayColor from "./overlayColor";

const overlayColorHex = (
  foregroundColor: Color | string,
  backgroundColor: Color | string,
  opacity = 0.5
): string => {
  return hslaToHex(overlayColor(foregroundColor, backgroundColor, opacity));
};

export default overlayColorHex;
