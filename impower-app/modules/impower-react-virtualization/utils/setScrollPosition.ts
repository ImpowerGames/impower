import { Direction } from "../types/constants";
import { setScrollX } from "./setScrollX";
import { setScrollY } from "./setScrollY";

export const setScrollPosition = (
  element: HTMLElement,
  direction: Direction,
  value: number
): void => {
  if (!element) {
    return;
  }
  if (direction === Direction.Vertical) {
    setScrollY(element, value);
  } else {
    setScrollX(element, value);
  }
};
