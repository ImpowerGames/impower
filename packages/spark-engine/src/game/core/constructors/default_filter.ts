import type { Create } from "../types/Create";
import type { Filter } from "../types/Filter";

export const default_filter: Create<Filter> = (obj) => ({
  $type: "filter",
  $name: "$default",
  ...obj,
  includes: obj?.includes ?? [""],
  excludes: obj?.excludes ?? [""],
});
