import { Color } from "../types/interfaces/color";
import getReadableForegroundColor from "./getReadableForegroundColor";
import hslaToHex from "./hslaToHex";

const getReadableForegroundColorHex = (
  foregroundColor: Color | string,
  backgroundColor: Color | string,
  desaturate = 0,
  changeLimit = 100,
  saturateWhileDarkening = false
): string => {
  return hslaToHex(
    getReadableForegroundColor(
      foregroundColor,
      backgroundColor,
      desaturate,
      changeLimit,
      saturateWhileDarkening
    )
  );
};

export default getReadableForegroundColorHex;
