import { PRINTED_LINE_HEIGHT } from "@impower/sparkdown-screenplay/src/utils/printGeometry";
import { TextOptions } from "../types/TextOptions";

export const DEFAULT_STYLE: TextOptions = {
  font: "Times-Roman",
  fontSize: 12,
  lineHeight: PRINTED_LINE_HEIGHT,
  align: "left",
  color: "#000000",
  removeTrailingSpaces: true,
  oblique: 0,
  underline: false,
};
