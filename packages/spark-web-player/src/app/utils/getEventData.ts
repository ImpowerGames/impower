import { EventMap } from "../../../../spark-engine/src/game/core/types/EventMap";

export const getEventData = <T extends keyof EventMap>(
  data: Event,
  element: string | null
) => {
  if (data.type === "click") {
    const mouseEventData = data as MouseEvent;
    return {
      type: mouseEventData.type,
      timeStamp: mouseEventData.timeStamp,
      altKey: mouseEventData.altKey,
      button: mouseEventData.button,
      buttons: mouseEventData.buttons,
      clientX: mouseEventData.clientX,
      clientY: mouseEventData.clientY,
      ctrlKey: mouseEventData.ctrlKey,
      metaKey: mouseEventData.metaKey,
      movementX: mouseEventData.movementX,
      movementY: mouseEventData.movementY,
      offsetX: mouseEventData.offsetX,
      offsetY: mouseEventData.offsetY,
      pageX: mouseEventData.pageX,
      pageY: mouseEventData.pageY,
      screenX: mouseEventData.screenX,
      screenY: mouseEventData.screenY,
      shiftKey: mouseEventData.shiftKey,
      x: mouseEventData.x,
      y: mouseEventData.y,
      element,
    } as EventMap[T];
  }
  const pointerEventData = data as PointerEvent;
  return {
    type: pointerEventData.type,
    timeStamp: pointerEventData.timeStamp,
    altKey: pointerEventData.altKey,
    button: pointerEventData.button,
    buttons: pointerEventData.buttons,
    clientX: pointerEventData.clientX,
    clientY: pointerEventData.clientY,
    ctrlKey: pointerEventData.ctrlKey,
    metaKey: pointerEventData.metaKey,
    movementX: pointerEventData.movementX,
    movementY: pointerEventData.movementY,
    offsetX: pointerEventData.offsetX,
    offsetY: pointerEventData.offsetY,
    pageX: pointerEventData.pageX,
    pageY: pointerEventData.pageY,
    screenX: pointerEventData.screenX,
    screenY: pointerEventData.screenY,
    shiftKey: pointerEventData.shiftKey,
    x: pointerEventData.x,
    y: pointerEventData.y,
    height: pointerEventData.height,
    isPrimary: pointerEventData.isPrimary,
    pointerId: pointerEventData.pointerId,
    pointerType: pointerEventData.pointerType,
    pressure: pointerEventData.pressure,
    tangentialPressure: pointerEventData.tangentialPressure,
    tiltX: pointerEventData.tiltX,
    tiltY: pointerEventData.tiltY,
    twist: pointerEventData.twist,
    width: pointerEventData.width,
    element,
  } as EventMap[T];
};
