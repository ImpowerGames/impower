import { IElementEvent } from "./IElementEvent";
import { IFocusEvent } from "./IFocusEvent";
import { IKeyboardEvent } from "./IKeyboardEvent";
import { IMouseEvent } from "./IMouseEvent";
import { IPointerEvent } from "./IPointerEvent";
import { ITouchEvent } from "./ITouchEvent";
import { IWheelEvent } from "./IWheelEvent";

export interface EventMap {
  click: IMouseEvent<"click">;
  mousedown: IMouseEvent<"mousedown">;
  mouseenter: IMouseEvent<"mouseenter">;
  mouseleave: IMouseEvent<"mouseleave">;
  mousemove: IMouseEvent<"mousemove">;
  mouseout: IMouseEvent<"mouseout">;
  mouseover: IMouseEvent<"mouseover">;
  mouseup: IMouseEvent<"mouseup">;

  pointercancel: IPointerEvent<"pointercancel">;
  pointerdown: IPointerEvent<"pointerdown">;
  pointerenter: IPointerEvent<"pointerenter">;
  pointerleave: IPointerEvent<"pointerleave">;
  pointermove: IPointerEvent<"pointermove">;
  pointerout: IPointerEvent<"pointerout">;
  pointerover: IPointerEvent<"pointerover">;
  pointerup: IPointerEvent<"pointerup">;
  gotpointercapture: IPointerEvent<"gotpointercapture">;
  lostpointercapture: IPointerEvent<"lostpointercapture">;

  touchcancel: ITouchEvent<"touchcancel">;
  touchend: ITouchEvent<"touchend">;
  touchmove: ITouchEvent<"touchmove">;
  touchstart: ITouchEvent<"touchstart">;

  drag: IMouseEvent<"drag">;
  dragend: IMouseEvent<"dragend">;
  dragenter: IMouseEvent<"dragenter">;
  dragleave: IMouseEvent<"dragleave">;
  dragover: IMouseEvent<"dragover">;
  dragstart: IMouseEvent<"dragstart">;
  drop: IMouseEvent<"drop">;

  wheel: IWheelEvent<"wheel">;

  scroll: IElementEvent<"scroll">;
  scrollend: IElementEvent<"scrollend">;

  input: IElementEvent<"input">;

  keydown: IKeyboardEvent<"keydown">;
  keyup: IKeyboardEvent<"keyup">;
  keypress: IKeyboardEvent<"keypress">;

  focus: IFocusEvent<"focus">;
  focusin: IFocusEvent<"focusin">;
  focusout: IFocusEvent<"focusout">;
  blur: IFocusEvent<"blur">;
}
