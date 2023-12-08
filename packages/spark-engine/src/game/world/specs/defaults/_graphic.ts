import { Create } from "../../../core/types/Create";
import { Graphic } from "../Graphic";

export const _graphic: Create<Graphic> = (obj) => ({
  width: 32,
  height: 32,
  ...(obj || {}),
  tiling: {
    on: false,
    zoom: 1,
    angle: 0,
    ...(obj?.tiling || {}),
  },
  transform: {
    position: {
      x: 0,
      y: 0,
      z: 0,
      ...(obj?.transform?.position || {}),
    },
    rotation: {
      x: 0,
      y: 0,
      z: 0,
      ...(obj?.transform?.rotation || {}),
    },
    scale: {
      x: 1,
      y: 1,
      z: 1,
      ...(obj?.transform?.scale || {}),
    },
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
