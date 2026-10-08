import { Container as RuntimeContainer } from "../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../../runtime/ControlCommand";
import { Divert } from "./Divert/Divert";
import { Divert as RuntimeDivert } from "../../../engine/Divert";
import { DivertTargetValue } from "../../../../runtime/Value";
import { ParsedObject } from "./Object";
import { InkObject as RuntimeObject } from "../../../../runtime/Object";
import { Story } from "./Story";
import { Void } from "../../../../runtime/Void";
import { asOrNull } from "../../../../runtime/TypeAssertion";
import { VariableReference } from "../../../engine/VariableReference";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import { ConstValue, Op } from "../../../../program/ProgramInstructions";

export class TunnelOnwards extends ParsedObject {
  private _overrideDivertTarget: DivertTargetValue | null = null;

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

  /** What `GenerateRuntimeObject` does without the runtime objects: the
   *  divert it goes on with prepared, as generation generates it, uncached. */
  protected override Prepare(): boolean {
    this.divertAfter?.PrepareUncached();
    return true;
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    const container = new RuntimeContainer();

    // Set override path for tunnel onwards (or nothing)
    container.AddContent(RuntimeControlCommand.EvalStart());

    if (this.divertAfter) {
      // Generate runtime object's generated code and steal the arguments runtime code
      const returnRuntimeObj = this.divertAfter.GenerateRuntimeObject();
      const returnRuntimeContainer = returnRuntimeObj as RuntimeContainer;
      if (returnRuntimeContainer) {
        // Steal all code for generating arguments from the divert
        const args = this.divertAfter.args;
        if (args !== null && args.length > 0) {
          // Steal everything betwen eval start and eval end
          let evalStart = -1;
          let evalEnd = -1;
          for (
            let ii = 0;
            ii < returnRuntimeContainer.content.length;
            ii += 1
          ) {
            const cmd = returnRuntimeContainer.content[
              ii
            ] as RuntimeControlCommand;
            if (cmd) {
              if (
                evalStart == -1 &&
                cmd.commandType === RuntimeControlCommand.CommandType.EvalStart
              ) {
                evalStart = ii;
              } else if (
                cmd.commandType === RuntimeControlCommand.CommandType.EvalEnd
              ) {
                evalEnd = ii;
              }
            }
          }

          for (let ii = evalStart + 1; ii < evalEnd; ii += 1) {
            const obj = returnRuntimeContainer.content[ii];
            obj!.parent = null; // prevent error of being moved between owners
            container.AddContent(returnRuntimeContainer.content[ii]!);
          }
        }
      }
      // Supply the divert target for the tunnel onwards target, either variable or more commonly, the explicit name
      // var returnDivertObj = returnRuntimeObj as Runtime.Divert;
      let returnDivertObj = asOrNull(returnRuntimeObj, RuntimeDivert);
      if (returnDivertObj != null && returnDivertObj.hasVariableTarget) {
        let runtimeVarRef = new VariableReference(
          returnDivertObj.variableDivertName,
        );
        container.AddContent(runtimeVarRef);
      } else {
        this._overrideDivertTarget = new DivertTargetValue();
        container.AddContent(this._overrideDivertTarget);
      }
    } else {
      // No divert after tunnel onwards
      container.AddContent(new Void());
    }

    container.AddContent(RuntimeControlCommand.EvalEnd());
    container.AddContent(RuntimeControlCommand.PopTunnel());

    return container;
  };

  public override ResolveWith(context: Story, program: boolean): void {
    super.ResolveWith(context, program);

    if (program) {
      // The program pushes the target's symbol (`EmitProgram`), and the
      // target's runtime object is another statement's.
    } else if (this.divertAfter && this.divertAfter.targetContent) {
      this._overrideDivertTarget!.targetPath =
        this.divertAfter.targetContent.runtimePath;
    } else if (this._overrideDivertTarget) {
      // No target this compile: a REUSED override value would otherwise keep
      // last compile's path. Restore fresh-generation state — see the same
      // repair in `DivertTarget`/`Divert.ResolveReferences`.
      this._overrideDivertTarget.value = null;
    }
  }

  public override toString = (): string => {
    return ` -> ${this._divertAfter}`;
  };
}
