import { List, Color, UnitNumberData } from "../../../../impower-core";
import { FillType } from "../../enums/fillType";
import { GradientType } from "../../enums/gradientType";
import { FileReference } from "../references/fileReference";

export interface FillProps {
  type: FillType;
  gradientType: GradientType;
  color: Color;
  gradientAngle: number;
  gradientColorStops: List<{ color: Color; position: UnitNumberData }>;
  image: FileReference;
}
