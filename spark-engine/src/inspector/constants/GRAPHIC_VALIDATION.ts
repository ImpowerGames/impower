import { Graphic } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";

export const GRAPHIC_VALIDATION = (objectMap?: {
  [type: string]: Record<string, object>;
}): RecursiveValidation<Graphic> => {
  const colorNames = Object.keys(objectMap?.["color"] || {});
  return {
    width: [8, 0, 800],
    height: [8, 0, 800],
    tiling: {
      zoom: [0.1, 0, 4],
      angle: [1, 0, 360],
    },
    shapes: [
      {
        fillColor: colorNames,
        fillOpacity: [0.1, 0, 1],
        strokeColor: colorNames,
        strokeOpacity: [0.1, 0, 1],
        strokeWeight: [1, 0, 50],
        strokeJoin: ["round", "arcs", "bevel"],
        strokeCap: ["round", "square", "butt"],
      },
    ],
  };
};
