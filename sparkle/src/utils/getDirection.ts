export const getDirection = (
  orientation: string | null | undefined,
  oldRect: DOMRect | undefined,
  newRect: DOMRect,
  reverse?: boolean
) => {
  if (orientation == null) {
    return null;
  }
  if (orientation === "vertical") {
    const oldY = oldRect?.y ?? 0;
    const newY = newRect.y;
    const delta = newY - oldY;
    if (delta < 0) {
      return reverse ? "down" : "up";
    }
    return reverse ? "up" : "down";
  } else {
    const oldX = oldRect?.x ?? 0;
    const newX = newRect.x;
    const delta = newX - oldX;
    if (delta < 0) {
      return reverse ? "right" : "left";
    }
    return reverse ? "left" : "right";
  }
};
