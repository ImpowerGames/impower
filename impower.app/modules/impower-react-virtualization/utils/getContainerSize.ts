import { Direction } from "../types/constants";
import { getContainerHeight } from "./getContainerHeight";
import { getContainerWidth } from "./getContainerWidth";

export const getContainerSize = (
  element: HTMLElement,
  direction: Direction
): number => {
  if (!element) {
    return 0;
  }
  if (direction === Direction.Vertical) {
    return getContainerHeight(element);
  }
  return getContainerWidth(element);
};
