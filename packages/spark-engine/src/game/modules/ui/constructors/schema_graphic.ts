import { Graphic } from "../../..";
import { Create } from "../../../core/types/Create";
import { Schema } from "../../../core/types/Schema";

export const schema_graphic: Create<Schema<Graphic>> = () => ({
  $type: "graphic",
  $name: "$schema",
  width: [8, 0, 800],
  height: [8, 0, 800],
  tiling: {
    zoom: [0.1, 0, 4],
    angle: [1, 0, 360],
  },
  shapes: [
    {
      fill_color: ["black", "white", { $type: "color" }],
      fill_opacity: [0.1, 0, 1],
      stroke_color: ["black", "white"],
      stroke_opacity: [0.1, 0, 1],
      stroke_weight: [1, 0, 50],
      stroke_join: ["round", "arcs", "bevel"],
      stroke_cap: ["round", "square", "butt"],
    },
  ],
});
