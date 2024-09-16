import { Reference } from "../../../core/types/Reference";

export interface Font extends Reference<"font"> {
  src: string;
  font_family: string;
  font_weight: string;
  font_style: string;
  font_display: string;
  font_stretch: string;
  unicode_range: string;
}
