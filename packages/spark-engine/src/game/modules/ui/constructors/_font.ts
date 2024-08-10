import { Create } from "../../../core/types/Create";
import { Font } from "../types/Font";

export const _font: Create<Font> = (obj) => ({
  $type: "font",
  src: "",
  font_family: "",
  font_weight: "",
  font_style: "",
  font_display: "block",
  font_stretch: "",
  unicode_range: "",
  ...obj,
});
