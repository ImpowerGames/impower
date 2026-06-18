import { IElementEvent } from "./IElementEvent";

/** An `input` / `change` event from a form control. Carries the control's
 *  current value/checked so an `@input`/`@change` handler can write it back into
 *  Luau state (two-way binding). */
export interface IInputEvent<T extends string> extends IElementEvent<T> {
  /** Current text/range value of the control (`<input>.value`). */
  readonly value?: string;
  /** Current checked state of a checkbox/radio (`<input>.checked`). */
  readonly checked?: boolean;
}
