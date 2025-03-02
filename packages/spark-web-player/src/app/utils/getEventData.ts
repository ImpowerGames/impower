import { EventMap } from "@impower/spark-engine/src/game/core/types/EventMap";

export const getEventData = <T extends keyof EventMap>(event: Event) => {
  const mouseEventData = event as MouseEvent;
  if (
    mouseEventData.type === "click" ||
    mouseEventData.type === "mousedown" ||
    mouseEventData.type === "mouseenter" ||
    mouseEventData.type === "mouseleave" ||
    mouseEventData.type === "mousemove" ||
    mouseEventData.type === "mouseout" ||
    mouseEventData.type === "mouseover" ||
    mouseEventData.type === "mouseup" ||
    mouseEventData.type === "drag" ||
    mouseEventData.type === "dragend" ||
    mouseEventData.type === "dragenter" ||
    mouseEventData.type === "dragleave" ||
    mouseEventData.type === "dragover" ||
    mouseEventData.type === "dragstart" ||
    mouseEventData.type === "drop"
  ) {
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
      targetId: (mouseEventData.target as HTMLElement)?.id,
      currentTargetId: (mouseEventData.currentTarget as HTMLElement)?.id,
    } as EventMap[T];
  }
  const pointerEventData = event as PointerEvent;
  if (
    pointerEventData.type === "pointercancel" ||
    pointerEventData.type === "pointerdown" ||
    pointerEventData.type === "pointerenter" ||
    pointerEventData.type === "pointerleave" ||
    pointerEventData.type === "pointermove" ||
    pointerEventData.type === "pointerout" ||
    pointerEventData.type === "pointerover" ||
    pointerEventData.type === "pointerup" ||
    pointerEventData.type === "gotpointercapture" ||
    pointerEventData.type === "lostpointercapture"
  ) {
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
      targetId: (pointerEventData.target as HTMLElement)?.id,
      currentTargetId: (pointerEventData.currentTarget as HTMLElement)?.id,
    } as EventMap[T];
  }
  const wheelEventData = event as WheelEvent;
  if (wheelEventData.type === "wheel") {
    return {
      type: wheelEventData.type,
      timeStamp: wheelEventData.timeStamp,
      altKey: wheelEventData.altKey,
      button: wheelEventData.button,
      buttons: wheelEventData.buttons,
      clientX: wheelEventData.clientX,
      clientY: wheelEventData.clientY,
      ctrlKey: wheelEventData.ctrlKey,
      metaKey: wheelEventData.metaKey,
      movementX: wheelEventData.movementX,
      movementY: wheelEventData.movementY,
      offsetX: wheelEventData.offsetX,
      offsetY: wheelEventData.offsetY,
      pageX: wheelEventData.pageX,
      pageY: wheelEventData.pageY,
      screenX: wheelEventData.screenX,
      screenY: wheelEventData.screenY,
      shiftKey: wheelEventData.shiftKey,
      x: wheelEventData.x,
      y: wheelEventData.y,
      deltaMode: wheelEventData.deltaMode,
      deltaX: wheelEventData.deltaX,
      deltaY: wheelEventData.deltaY,
      deltaZ: wheelEventData.deltaZ,
      targetId: (wheelEventData.target as HTMLElement)?.id,
      currentTargetId: (wheelEventData.currentTarget as HTMLElement)?.id,
    } as EventMap[T];
  }
  const touchEventData = event as TouchEvent;
  if (
    touchEventData.type === "touchcancel" ||
    touchEventData.type === "touchend" ||
    touchEventData.type === "touchmove" ||
    touchEventData.type === "touchstart"
  ) {
    return {
      type: touchEventData.type,
      timeStamp: touchEventData.timeStamp,
      altKey: touchEventData.altKey,
      ctrlKey: touchEventData.ctrlKey,
      metaKey: touchEventData.metaKey,
      shiftKey: touchEventData.shiftKey,
      changedTouches: Array.from(
        { length: touchEventData.changedTouches.length },
        (_, index) => touchEventData.changedTouches.item(index)
      ),
      targetTouches: Array.from(
        { length: touchEventData.targetTouches.length },
        (_, index) => touchEventData.targetTouches.item(index)
      ),
      touches: Array.from(
        { length: touchEventData.touches.length },
        (_, index) => touchEventData.touches.item(index)
      ),
      targetId: (touchEventData.target as HTMLElement)?.id,
      currentTargetId: (touchEventData.currentTarget as HTMLElement)?.id,
    } as EventMap[T];
  }
  const keyboardEventData = event as KeyboardEvent;
  if (
    keyboardEventData.type === "keydown" ||
    keyboardEventData.type === "keyup" ||
    keyboardEventData.type === "keypress"
  ) {
    return {
      type: keyboardEventData.type,
      timeStamp: keyboardEventData.timeStamp,
      altKey: keyboardEventData.altKey,
      ctrlKey: keyboardEventData.ctrlKey,
      metaKey: keyboardEventData.metaKey,
      shiftKey: keyboardEventData.shiftKey,
      code: keyboardEventData.code,
      isComposing: keyboardEventData.isComposing,
      key: keyboardEventData.key,
      location: keyboardEventData.location,
      repeat: keyboardEventData.repeat,
      targetId: (keyboardEventData.target as HTMLElement)?.id,
      currentTargetId: (keyboardEventData.currentTarget as HTMLElement)?.id,
    } as EventMap[T];
  }
  const focusEventData = event as FocusEvent;
  if (
    focusEventData.type === "focus" ||
    focusEventData.type === "focusin" ||
    focusEventData.type === "focusout" ||
    focusEventData.type === "blur"
  ) {
    return {
      type: focusEventData.type,
      targetId: (focusEventData.target as HTMLElement)?.id,
      currentTargetId: (focusEventData.currentTarget as HTMLElement)?.id,
      relatedTargetId: (focusEventData.relatedTarget as HTMLElement)?.id,
    } as EventMap[T];
  }
  return {
    targetId: (event.target as HTMLElement)?.id,
    currentTargetId: (event.currentTarget as HTMLElement)?.id,
  } as EventMap[T];
};
