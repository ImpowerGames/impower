import { TextOptions } from "../types/TextOptions";

// Default Style. If one style attribute is not set when calling addTextbox, the
// respective default attribute is set.
export const DEFAULT_STYLE: TextOptions = {
  font: "Times-Roman",
  fontSize: 12,
  lineHeight: 1,
  align: "left",
  color: "#000000",
  removeTrailingSpaces: true,
  oblique: 0,
  underline: false,
};
