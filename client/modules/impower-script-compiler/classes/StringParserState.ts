import { IStringParserState } from "../types/IStringParserState";
import { StringParserElement } from "./StringParserElement";

export class StringParserState implements IStringParserState {
  private _numElements: number;

  private _stack: StringParserElement[];

  protected get currentElement(): StringParserElement {
    return this._stack[this._numElements - 1];
  }

  get lineIndex(): number {
    return this.currentElement.lineIndex;
  }

  set lineIndex(value: number) {
    this.currentElement.lineIndex = value;
  }

  get characterIndex(): number {
    return this.currentElement.characterIndex;
  }

  set characterIndex(value: number) {
    this.currentElement.characterIndex = value;
  }

  get characterInLineIndex(): number {
    return this.currentElement.characterInLineIndex;
  }

  set characterInLineIndex(value: number) {
    this.currentElement.characterInLineIndex = value;
  }

  get customFlags(): number {
    return this.currentElement.customFlags;
  }

  set customFlags(value: number) {
    this.currentElement.customFlags = value;
  }

  get errorReportedAlreadyInScope(): boolean {
    return this.currentElement.reportedErrorInScope;
  }

  get stackHeight(): number {
    return this._numElements;
  }

  constructor() {
    const kExpectedMaxStackDepth = 200;
    this._stack = [];

    for (let i = 0; i < kExpectedMaxStackDepth; i += 1) {
      this._stack[i] = new StringParserElement();
    }

    this._numElements = 1;
  }

  Push(): number {
    if (this._numElements >= this._stack.length)
      throw new Error("Stack overflow in parser state");

    const prevElement = this._stack[this._numElements - 1];
    const newElement = this._stack[this._numElements];
    this._numElements += 1;

    newElement.CopyFrom(prevElement);

    return newElement.uniqueId;
  }

  Pop(expectedRuleId: number): void {
    if (this._numElements === 1) {
      throw new Error(
        "Attempting to remove final stack element is illegal! Mismatched Begin/Succceed/Fail?"
      );
    }

    if (this.currentElement.uniqueId !== expectedRuleId)
      throw new Error(
        "Mismatched rule IDs - do you have mismatched Begin/Succeed/Fail?"
      );

    // Restore state
    this._numElements -= 1;
  }

  Peek(expectedRuleId: number): StringParserElement {
    if (this.currentElement.uniqueId !== expectedRuleId)
      throw new Error(
        "Mismatched rule IDs - do you have mismatched Begin/Succeed/Fail?"
      );

    return this._stack[this._numElements - 1];
  }

  PeekPenultimate(): StringParserElement {
    if (this._numElements >= 2) {
      return this._stack[this._numElements - 2];
    }
    return null;
  }

  // Reduce stack height while maintaining currentElement
  // Remove second last element: i.e. "squash last two elements together"
  // Used when succeeding from a rule (and ONLY when succeeding, since
  // the state of the top element is retained).
  Squash(): void {
    if (this._numElements < 2) {
      throw new Error(
        "Attempting to remove final stack element is illegal! Mismatched Begin/Succceed/Fail?"
      );
    }

    const penultimateEl = this._stack[this._numElements - 2];
    const lastEl = this._stack[this._numElements - 1];

    penultimateEl.SquashFrom(lastEl);

    this._numElements -= 1;
  }

  NoteErrorReported(): void {
    this._stack.forEach((el) => {
      el.reportedErrorInScope = true;
    });
  }
}
