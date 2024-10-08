import { Create } from "../../../core/types/Create";
import { LayerFilter } from "../types/LayerFilter";

export const _layerFilter: Create<LayerFilter> = (obj) => ({
  $type: "layer_filter",
  ...obj,
  includes: obj.includes ?? [],
  excludes: obj.excludes ?? [],
});
