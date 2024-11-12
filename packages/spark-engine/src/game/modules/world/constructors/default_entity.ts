import { Create } from "../../../core/types/Create";
import { Entity } from "../types/Entity";

export const default_entity: Create<Entity> = (obj) => ({
  $type: "entity",
  $name: "$default",
  ...obj,
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
  symbol: "X",
  graphic: "",
});
