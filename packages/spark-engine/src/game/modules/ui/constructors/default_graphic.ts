import { Create } from "../../../core/types/Create";
import { Graphic } from "../types/Graphic";

export const default_graphic: Create<Graphic> = (obj) => ({
  $type: "graphic",
  $name: "$default",
  width: 32,
  height: 32,
  ...obj,
  tiling: {
    on: false,
    zoom: 1,
    angle: 0,
    ...(obj?.tiling || {}),
  },
  shapes: obj?.shapes ?? [
    {
      path: "M 0 0 L 64 0 L 64 64 L 0 64 L 0 0",
      fill_color: "none",
      fill_opacity: 1,
      stroke_color: "none",
      stroke_opacity: 1,
      stroke_weight: 1,
      stroke_join: "miter",
      stroke_cap: "round",
    },
  ],
});
