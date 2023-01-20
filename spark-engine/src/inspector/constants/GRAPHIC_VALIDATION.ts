import { Graphic, Theme } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";

export const GRAPHIC_VALIDATION = (objectMap?: {
  [type: string]: Record<string, object>;
}): RecursiveValidation<Graphic> => {
  const theme: Theme = (objectMap?.["theme"]?.[""] || {}) as Theme;
  const colorNames = Object.keys(theme?.colors || {});
  return {
    width: [8, 0, 800],
    height: [8, 0, 800],
    transform: {
      position: {
        x: [8, 0, 800],
        y: [8, 0, 800],
        z: [8, 0, 800],
      },
      rotation: {
        x: [1, 0, 360],
        y: [1, 0, 360],
        z: [1, 0, 360],
      },
      scale: {
        x: [0.1, 0, 4],
        y: [0.1, 0, 4],
        z: [0.1, 0, 4],
      },
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
