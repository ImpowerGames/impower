import { Activable } from "../../../../impower-core";
import { HorizontalAlignment, VerticalAlignment } from "../../enums/alignment";
import { ArrangementType } from "../../enums/arrangementType";
import { GridDirection, ListDirection } from "../../enums/layoutDirection";
import { LayoutSize } from "../../enums/layoutSize";
import { ScrollbarType } from "../../enums/scrollbarType";

export interface LayoutProps {
  childArrangement: ArrangementType;
  direction: ListDirection | GridDirection;
  width: LayoutSize;
  height: LayoutSize;
  verticalAlignment: VerticalAlignment;
  horizontalAlignment: HorizontalAlignment;
  spaceAround: number;
  spaceBetween: number;
  minColumnCount: Activable<number>;
  minRowCount: Activable<number>;
  verticalScrollbar: ScrollbarType;
  horizontalScrollbar: ScrollbarType;
}
