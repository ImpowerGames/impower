import { Graphic } from "./Graphic";

export interface Transform {
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  scale: {
    x: number;
    y: number;
    z: number;
  };
}

export interface Entity {
  transform: Transform;
  graphic?: Graphic;
}
