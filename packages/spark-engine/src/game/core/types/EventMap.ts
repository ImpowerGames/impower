import { IMouseEvent } from "./IMouseEvent";
import { IPointerEvent } from "./IPointerEvent";

export type ClickEvent = IMouseEvent<"click">;
export type PointerDownEvent = IPointerEvent<"pointerdown">;
export type PointerUpEvent = IPointerEvent<"pointerup">;

export interface EventMap {
  click: ClickEvent;
  pointerdown: PointerDownEvent;
  pointerup: PointerUpEvent;
}
