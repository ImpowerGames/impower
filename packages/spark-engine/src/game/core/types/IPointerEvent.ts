import { IMouseEvent } from "./IMouseEvent";

export interface IPointerEvent<T extends string> extends IMouseEvent<T> {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PointerEvent/height) */
  readonly height: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PointerEvent/isPrimary) */
  readonly isPrimary: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PointerEvent/pointerId) */
  readonly pointerId: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PointerEvent/pointerType) */
  readonly pointerType: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PointerEvent/pressure) */
  readonly pressure: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PointerEvent/tangentialPressure) */
  readonly tangentialPressure: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PointerEvent/tiltX) */
  readonly tiltX: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PointerEvent/tiltY) */
  readonly tiltY: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PointerEvent/twist) */
  readonly twist: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/PointerEvent/width) */
  readonly width: number;
}
