import { Create } from "../../../core/types/Create";
import { Font } from "../types/Font";

export const default_font: Create<Font> = (obj) => ({
  $type: "font",
  $name: "$default",
  src: "",
  font_family: "",
  font_weight: "normal",
  font_style: "normal",
  font_stretch: "normal",
  font_display: "block",
  unicode_range: "U+0-10FFFF",
  ...obj,
});
