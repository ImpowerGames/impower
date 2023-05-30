import { Direction } from "../types/constants";
import { getScrollX } from "./getScrollX";
import { getScrollY } from "./getScrollY";

export const getScrollPosition = (
  element: HTMLElement,
  direction: Direction = Direction.Vertical
): number => {
  if (!element) {
    return 0;
  }
  if (direction === Direction.Vertical) {
    return getScrollY(element);
  }
  return getScrollX(element);
};
