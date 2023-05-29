import type { Rect, Strategy } from "../../../core";
export declare function convertOffsetParentRelativeRectToViewportRelativeRect({
  rect,
  offsetParent,
  strategy,
}: {
  rect: Rect;
  offsetParent: Element | Window;
  strategy: Strategy;
}): Rect;
