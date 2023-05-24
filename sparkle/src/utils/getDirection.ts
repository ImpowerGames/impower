export const getDirection = (
  axis: string | null | undefined,
  oldRect: DOMRect | undefined,
  newRect: DOMRect,
  reverse?: boolean
) => {
  if (axis == null) {
    return null;
  }
  if (axis === "z") {
    const oldX = oldRect?.x ?? 0;
    const newX = newRect.x;
    const delta = newX - oldX;
    if (delta < 0) {
      return reverse ? "out" : "in";
    }
    return reverse ? "in" : "out";
  }
  if (axis === "y") {
    const oldY = oldRect?.y ?? 0;
    const newY = newRect.y;
    const delta = newY - oldY;
    if (delta < 0) {
      return reverse ? "down" : "up";
    }
    return reverse ? "up" : "down";
  }
  const oldX = oldRect?.x ?? 0;
  const newX = newRect.x;
  const delta = newX - oldX;
  if (delta < 0) {
    return reverse ? "right" : "left";
  }
  return reverse ? "left" : "right";
};
