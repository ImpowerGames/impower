import { Color } from "../types/interfaces/color";
import getReadableBackgroundColor from "./getReadableBackgroundColor";
import hslaToHex from "./hslaToHex";

const getReadableBackgroundColorHex = (
  foregroundColor: Color | string,
  backgroundColor: Color | string,
  desaturate = 0,
  changeLimit = 100,
  saturateWhileDarkening = false
): string => {
  return hslaToHex(
    getReadableBackgroundColor(
      foregroundColor,
      backgroundColor,
      desaturate,
      changeLimit,
      saturateWhileDarkening
    )
  );
};

export default getReadableBackgroundColorHex;
