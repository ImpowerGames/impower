import { Create } from "../../../core/types/Create";
import { Font } from "../types/Font";

export const _font: Create<Font> = (obj) => ({
  $type: "font",
  src: "",
  weight: 400,
  style: "normal",
  ...obj,
});
