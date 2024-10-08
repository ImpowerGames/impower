import { Reference } from "../../../core/types/Reference";

export interface LayerFilter extends Reference<"layer_filter"> {
  includes: string[];
  excludes: string[];
}
