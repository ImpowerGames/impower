import { EntityState } from "../interfaces/EntityState";

export const createEntityState = (): EntityState => ({
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
});
