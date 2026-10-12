import { Divert } from "./Divert/Divert";
import { ParsedObject } from "./Object";
import { Story } from "./Story";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import { ConstValue, Op } from "../../../../program/ProgramInstructions";

export class TunnelOnwards extends ParsedObject {
  private _divertAfter: Divert | null = null;
  get divertAfter() {
    return this._divertAfter;
  }

  set divertAfter(value) {
    this._divertAfter = value;
    if (this._divertAfter) {
      this.AddContent(this._divertAfter);
    }
  }

  override get typeName(): string {
    return "TunnelOnwards";
  }

  // The target `->->` goes on to, if any: the arguments it passes that
  // target, as its divert passes them (`Divert.EmitArguments`), which stay
  // on the stack for the flow it enters to bind, as the current engine's
  // onward return leaves the code it takes from the divert, and the symbol
  // value of the target it names (`Sym`) or the value of the variable it
  // names (`GetVar`), or void to return to the caller; then `TunnelReturn`
  // (docs/engine/binary-program.md, section 3).
  public override EmitProgram(emitter: ProgramEmitter): void {
    const after = this.divertAfter;
    if (!after) {
      emitter.emit(Op.Const, 0, ConstValue.Void);
    } else {
      after.EmitArguments(emitter);
      const key = after.programJumpKey;
      if (key !== null) {
        emitter.recordResolution(key);
      }
      const variable = after.variableDivertName;
      if (variable != null) {
        emitter.emit(Op.GetVar, emitter.variable(variable));
      } else {
        const symbol = emitter.targetSymbol(
          after.targetContent,
          after.writtenTargetName,
        );
        emitter.referenceTarget(symbol);
        emitter.emit(Op.Sym, symbol);
      }
    }
    emitter.emit(Op.TunnelReturn);
  }

  /** The divert it goes on with prepared, uncached. */
  protected override Prepare(): boolean {
    this.divertAfter?.PrepareUncached();
    return true;
  }

  public override ResolveWith(context: Story): void {
    // The program pushes the target's symbol (`EmitProgram`).
    super.ResolveWith(context);
  }

  public override toString = (): string => {
    return ` -> ${this._divertAfter}`;
  };
}
