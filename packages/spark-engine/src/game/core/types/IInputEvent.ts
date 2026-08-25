import { IElementEvent } from "./IElementEvent";

/** An `input` / `change` event from a form control. Carries the control's
 *  current value/checked so an `@input`/`@change` handler can write it back into
 *  Luau state (two-way binding). */
export interface IInputEvent<T extends string> extends IElementEvent<T> {
  /** Current value of the control. A text control sends its string
   *  (`<input>.value`); a range/number control sends a number
   *  (`<input>.valueAsNumber`) so a numeric store stays numeric. */
  readonly value?: string | number;
  /** Current checked state of a checkbox/radio (`<input>.checked`). */
  readonly checked?: boolean;
}
