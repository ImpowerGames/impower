export const getClientXY = (
  event: MouseEvent | TouchEvent | PointerEvent
): { clientX: number; clientY: number } => {
  const touchEvent = event as TouchEvent;
  const mouseEvent = event as MouseEvent;
  const pointerEvent = event as PointerEvent;
  if (touchEvent && touchEvent.touches && touchEvent.touches.length === 1) {
    const touch = touchEvent.touches[0];
    return { clientX: touch.clientX, clientY: touch.clientY };
  }
  if (mouseEvent && mouseEvent.clientX && mouseEvent.clientY) {
    return { clientX: mouseEvent.clientX, clientY: mouseEvent.clientY };
  }
  return { clientX: pointerEvent.clientX, clientY: pointerEvent.clientY };
};
