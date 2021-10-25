import { Vector2, UnitNumberData } from "../../../../impower-core";

export interface TransformProps {
  rotation: number;
  offset: Vector2;
  scale: Vector2;
  skew: Vector2;
  origin: { x: UnitNumberData; y: UnitNumberData };
}
