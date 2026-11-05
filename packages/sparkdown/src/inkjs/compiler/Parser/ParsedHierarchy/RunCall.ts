import type { RunOperand } from "../../../../compiler/classes/annotators/CompilationAnnotator";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import { FunctionCall } from "./FunctionCall";
import { Identifier } from "./Identifier";
import type { Story } from "./Story";

export class RunCall extends FunctionCall {
  private _wrapper: string | null = null;

  constructor(readonly operand: RunOperand) {
    super(new Identifier(""), []);
    this.shouldPopReturnedValue = true;
  }

  get wrapper(): string | null {
    return this._wrapper;
  }

  target(wrapper: string | null): boolean {
    if (wrapper === this._wrapper) {
      return false;
    }
    this._wrapper = wrapper;
    this.retarget(new Identifier(wrapper ?? ""));
    return true;
  }

  public override PrepareIntoContainer(): void {
    if (this._wrapper) {
      super.PrepareIntoContainer();
    }
  }

  public override ResolveWith(context: Story): void {
    if (this._wrapper) {
      super.ResolveWith(context);
    }
  }

  public override EmitExpression(emitter: ProgramEmitter): void {
    if (this._wrapper) {
      super.EmitExpression(emitter);
    }
  }
}
