import { Color } from "../../../../impower-core";
import { ShadowPosition } from "../../enums/shadowPosition";

export interface GlowProps {
  position: ShadowPosition;
  color: Color;
  blur: number;
  spread: number;
  x: number;
  y: number;
}
