import { IElementEvent } from "./IElementEvent";

export interface Touch {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Touch/clientX) */
  readonly clientX: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Touch/clientY) */
  readonly clientY: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Touch/force) */
  readonly force: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Touch/identifier) */
  readonly identifier: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Touch/pageX) */
  readonly pageX: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Touch/pageY) */
  readonly pageY: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Touch/radiusX) */
  readonly radiusX: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Touch/radiusY) */
  readonly radiusY: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Touch/rotationAngle) */
  readonly rotationAngle: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Touch/screenX) */
  readonly screenX: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Touch/screenY) */
  readonly screenY: number;
}

export interface ITouchEvent<T extends string> extends IElementEvent<T> {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/TouchEvent/altKey) */
  readonly altKey: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/TouchEvent/ctrlKey) */
  readonly ctrlKey: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/TouchEvent/metaKey) */
  readonly metaKey: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/TouchEvent/shiftKey) */
  readonly shiftKey: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/TouchEvent/changedTouches) */
  readonly changedTouches: (Touch | null)[];
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/TouchEvent/targetTouches) */
  readonly targetTouches: (Touch | null)[];
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/TouchEvent/touches) */
  readonly touches: (Touch | null)[];
}
