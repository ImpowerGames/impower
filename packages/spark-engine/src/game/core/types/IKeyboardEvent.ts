import { IElementEvent } from "./IElementEvent";

export interface IKeyboardEvent<T extends string> extends IElementEvent<T> {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/KeyboardEvent/altKey) */
  readonly altKey: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/KeyboardEvent/code) */
  readonly code: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/KeyboardEvent/ctrlKey) */
  readonly ctrlKey: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/KeyboardEvent/isComposing) */
  readonly isComposing: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/KeyboardEvent/key) */
  readonly key: string;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/KeyboardEvent/location) */
  readonly location: number;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/KeyboardEvent/metaKey) */
  readonly metaKey: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/KeyboardEvent/repeat) */
  readonly repeat: boolean;
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/KeyboardEvent/shiftKey) */
  readonly shiftKey: boolean;
}
