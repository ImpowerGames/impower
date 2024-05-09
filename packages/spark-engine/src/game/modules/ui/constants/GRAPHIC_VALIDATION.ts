import { Graphic } from "../../..";
import { RecursiveValidation } from "../../../core/types/RecursiveValidation";

export const GRAPHIC_VALIDATION = (typeMap?: {
  [type: string]: Record<string, object>;
}): RecursiveValidation<Graphic> => {
  const colorNames = Object.keys(typeMap?.["color"] || {});
  return {
    width: [8, 0, 800],
    height: [8, 0, 800],
    tiling: {
      zoom: [0.1, 0, 4],
      angle: [1, 0, 360],
    },
    shapes: [
      {
        fill_color: colorNames,
        fill_opacity: [0.1, 0, 1],
        stroke_color: colorNames,
        stroke_opacity: [0.1, 0, 1],
        stroke_weight: [1, 0, 50],
        stroke_join: ["round", "arcs", "bevel"],
        stroke_cap: ["round", "square", "butt"],
      },
    ],
  };
};
