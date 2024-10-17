import { Reference } from "./Reference";

export interface Filter extends Reference<"filter"> {
  includes: string[];
  excludes: string[];
}
