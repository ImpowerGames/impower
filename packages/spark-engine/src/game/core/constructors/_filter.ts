import { Create } from "../types/Create";
import { Filter } from "../types/Filter";

export const _filter: Create<Filter> = (obj) => ({
  $type: "filter",
  ...obj,
  includes: obj.includes ?? [],
  excludes: obj.excludes ?? [],
});
