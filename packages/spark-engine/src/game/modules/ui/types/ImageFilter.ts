import { Reference } from "../../../core/types/Reference";

export interface ImageFilter extends Reference<"image_filter"> {
  includes: string[];
  excludes: string[];
}
