import { Graphic } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";

export const GRAPHIC_VALIDATION: RecursiveValidation<Graphic> = {
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
      x: [0.1, 0, 1],
      y: [0.1, 0, 1],
      z: [0.1, 0, 1],
    },
  },
  stroke: {
    weight: [1, 0, 100],
    join: ["round", "arcs", "bevel"],
    cap: ["round", "square", "butt"],
  },
  opacity: [0.01, 0, 1],
};
