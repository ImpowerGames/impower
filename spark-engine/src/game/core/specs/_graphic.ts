import { Create } from "../types/Create";
import { Graphic } from "../types/Graphic";

export const _graphic: Create<Graphic> = () => ({
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
  fill: {
    on: true,
    color: "#000000",
  },
  stroke: {
    on: false,
    color: "#FFFFFF",
    weight: 1,
    join: "round",
    cap: "round",
  },
  opacity: 1,
  paths: ["M 0 0 L 64 0 L 64 64 L 0 64 L 0 0"],
});
