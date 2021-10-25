import { Color } from "../../../../impower-core";
import { BorderPosition } from "../../enums/borderPosition";

export interface BorderProps {
  color: Color;
  position: BorderPosition;
  size: number;
}
