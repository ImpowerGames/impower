import { Create } from "../../../core/types/Create";
import { Camera } from "../types/Camera";

export const _camera: Create<Camera> = (obj) => ({
  $type: "camera",
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
  depth: "top-down",
  type: "orthographic",
  width: 1920,
  height: 1080,
  fit: "cover",
  background: "",
  color: "#000",
});
