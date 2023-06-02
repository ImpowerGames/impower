import { Direction } from "../types/constants";

const getOffsetInternal = (
  total: number,
  child: HTMLElement,
  parent: HTMLElement,
  scrollDirection: Direction = Direction.Vertical
): number => {
  if (!child || child === parent || child.firstElementChild === parent) {
    return total;
  }
  const offset =
    scrollDirection === Direction.Vertical ? child.offsetTop : child.offsetLeft;
  return getOffsetInternal(
    total + offset,
    child.offsetParent as HTMLElement,
    parent,
    scrollDirection
  );
};

export const getOffset = (
  child: HTMLElement,
  parent: HTMLElement,
  scrollDirection: Direction = Direction.Vertical
): number => {
  if (!child || !parent) {
    return 0;
  }
  return getOffsetInternal(0, child, parent, scrollDirection);
};
