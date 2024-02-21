import { IMouseEvent } from "./IMouseEvent";

export interface IWheelEvent<T extends string> extends IMouseEvent<T> {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WheelEvent/deltaMode) */
  readonly deltaMode: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WheelEvent/deltaX) */
  readonly deltaX: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WheelEvent/deltaY) */
  readonly deltaY: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/WheelEvent/deltaZ) */
  readonly deltaZ: number;
}
