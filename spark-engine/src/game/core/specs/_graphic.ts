import { Create } from "../types/Create";
import { Graphic } from "../types/Graphic";

export const _graphic: Create<Graphic> = () => ({
  pattern: false,
  width: 32,
  height: 32,
  transform: {
    position: {
      x: 0,
      y: 0,
      z: 0,
    },
    rotation: {
      x: 0,
      y: 0,
      z: 0,
    },
    scale: {
      x: 1,
      y: 1,
      z: 1,
    },
  },
  shapes: [
    {
      path: "M 0 0 L 64 0 L 64 64 L 0 64 L 0 0",
      fillColor: "none",
      fillOpacity: 1,
      strokeColor: "none",
      strokeOpacity: 1,
      strokeWeight: 1,
      strokeJoin: "miter",
      strokeCap: "round",
    },
  ],
});
