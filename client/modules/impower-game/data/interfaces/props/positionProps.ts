import { HorizontalAnchor, VerticalAnchor } from "../../enums/anchor";
import { UnitNumberData } from "../../../../impower-core";

export interface PositionProps {
  verticalAnchor: VerticalAnchor;
  horizontalAnchor: HorizontalAnchor;
  top: UnitNumberData;
  bottom: UnitNumberData;
  right: UnitNumberData;
  left: UnitNumberData;
}
