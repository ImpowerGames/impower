import { IElementEvent } from "./IElementEvent";

export interface IMouseEvent<T extends string> extends IElementEvent<T> {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/altKey) */
  readonly altKey: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/button) */
  readonly button: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/buttons) */
  readonly buttons: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/clientX) */
  readonly clientX: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/clientY) */
  readonly clientY: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/ctrlKey) */
  readonly ctrlKey: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/metaKey) */
  readonly metaKey: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/movementX) */
  readonly movementX: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/movementY) */
  readonly movementY: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/offsetX) */
  readonly offsetX: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/offsetY) */
  readonly offsetY: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/pageX) */
  readonly pageX: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/pageY) */
  readonly pageY: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/screenX) */
  readonly screenX: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/screenY) */
  readonly screenY: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/shiftKey) */
  readonly shiftKey: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/x) */
  readonly x: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/MouseEvent/y) */
  readonly y: number;
}
