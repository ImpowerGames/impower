import { CameraState } from "../types/CameraState";

export const createCameraState = (): CameraState => ({
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
    x: 0,
    y: 0,
    z: 0,
  },
  type: "orthographic",
  depth: "top-down",
  width: 400,
  height: 300,
  fit: "cover",
  background: "",
  color: "#000000",
  spawnedEntities: [],
  entities: {},
});
