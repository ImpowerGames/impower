import { Container as RuntimeContainer } from "../../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../../engine/ControlCommand";
import { Expression } from "./Expression";
import { ParsedObject } from "../Object";
import { Text } from "../Text";
import { asOrNull } from "../../../../../runtime/TypeAssertion";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

export class StringExpression extends Expression {
  get isSingleString() {
    if (this.content.length !== 1) {
      return false;
    }

    const c = this.content[0];
    if (!(c instanceof Text)) {
      return false;
    }

    return true;
  }

  constructor(content: ParsedObject[]) {
    super();

    this.AddContent(content);
  }

  override get typeName(): string {
    return "String";
  }

  public readonly GenerateIntoContainer = (
    container: RuntimeContainer,
  ): void => {
    container.AddContent(RuntimeControlCommand.BeginString());

    for (const c of this.content) {
      container.AddContent(c.runtimeObject);
    }

    container.AddContent(RuntimeControlCommand.EndString());
  };

  // A string of text alone is the text its pieces join to, so it is one
  // pushed string: the capture the runtime objects build it in writes its
  // pieces to the output raw and joins them. A string that interpolates is
  // that capture: its text written, each interpolated expression's value
  // written by the `Out` its output ends with, and the joined text pushed
  // when the capture closes.
  public override EmitExpression(emitter: ProgramEmitter): void {
    if (this.content.every((c) => c instanceof Text)) {
      let text = "";
      for (const c of this.content as Text[]) {
        if (c.isCompilerNamed) {
          emitter.recordRead(c.text);
        }
        text += c.text;
      }
      emitter.emit(Op.Str, emitter.string(text));
      return;
    }
    emitter.emit(Op.BeginString);
    for (const c of this.content) {
      if (c instanceof Text && c.isCompilerNamed) {
        emitter.recordRead(c.text);
      }
      emitter.emitObject(c);
    }
    emitter.emit(Op.EndString);
  }

  public override readonly toString = (): string => {
    let sb = "";
    for (const c of this.content) {
      sb += c;
    }

    return sb;
  };

  // Equals override necessary in order to check for const multiple definition equality
  public override Equals(obj: ParsedObject): boolean {
    const otherStr = asOrNull(obj, StringExpression);
    if (otherStr === null) {
      return false;
    }

    // Can only compare direct equality on single strings rather than
    // complex string expressions that contain dynamic logic
    if (!this.isSingleString || !otherStr.isSingleString) {
      return false;
    }

    const thisTxt = this.toString();
    const otherTxt = otherStr.toString();
    return thisTxt === otherTxt;
  }
}
