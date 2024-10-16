import { Reference } from "../../../core/types/Reference";

export interface Filter extends Reference<"filter"> {
  includes: string[];
  excludes: string[];
}
