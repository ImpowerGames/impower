import { Expression } from "../Expression/Expression";
import { ParsedObject } from "../Object";
import { Story } from "../Story";
import { Text } from "../Text";
import { Weave } from "../Weave";
import { asOrNull } from "../../../../../runtime/TypeAssertion";
import type {
  ProgramEmitter,
  ProgramLabel,
} from "../../../../../program/ProgramEmitter";
import { JUMP_DECISION, Op } from "../../../../../program/ProgramInstructions";

export class ConditionalSingleBranch extends ParsedObject {
  public _ownExpression: Expression | null = null;
  public _innerWeave: Weave | null = null;
  // bool condition, e.g.:
  // { 5 == 4:
  //   - the true branch
  //   - the false branch
  // }
  public isTrueBranch: boolean = false;

  // When each branch has its own expression like a switch statement,
  // this is non-null. e.g.
  // { x:
  //    - 4: the value of x is four (ownExpression is the value 4)
  //    - 3: the value of x is three
  // }
  get ownExpression() {
    return this._ownExpression;
  }

  set ownExpression(value) {
    this._ownExpression = value;
    if (this._ownExpression) {
      this.AddContent(this._ownExpression);
    }
  }

  // In the above example, match equality of x with 4 for the first branch.
  // This is as opposed to simply evaluating boolean equality for each branch,
  // example when shouldMatchEquality is FALSE:
  // {
  //    3 > 2:  This will happen
  //    2 > 3:  This won't happen
  // }
  public matchingEquality: boolean = false;

  public isElse: boolean = false;
  public isInline: boolean = false;

  constructor(content?: ParsedObject[] | null | undefined) {
    super();

    // Branches are allowed to be empty
    if (content) {
      this._innerWeave = new Weave(content);
      this.AddContent(this._innerWeave);
    }
  }

  override get typeName(): string {
    return "ConditionalSingleBranch";
  }

  /** The `else:` written as content reported, the branch's test prepared,
   *  and the branch's weave. */
  protected override Prepare(): boolean {
    this.CheckElseWrittenAsContent();
    if (!this.isTrueBranch && !this.isElse && this.ownExpression) {
      this.ownExpression.PrepareIntoContainer();
    }
    this._innerWeave?.prepareRoot();
    return true;
  }

  /** The check preparation makes first: the common mistake of writing
   *  "else:" instead of "- else:", which the branch's weave holds as
   *  content. */
  protected CheckElseWrittenAsContent(): void {
    if (this._innerWeave) {
      for (const c of this._innerWeave.content) {
        const text = asOrNull(c, Text);
        // Don't need to trim at the start since the parser handles that already
        if (text && text.text.startsWith("else:")) {
          this.Warning(
            "Saw the text 'else:' which is being treated as content. Did you mean '- else:'?",
            text,
          );
        }
      }
    }
  }

  // One branch of its conditional's chunk: for a switch-like conditional a
  // copy of the value to compare with, the branch's test and a jump past the
  // branch when it fails, which is a decision the route planner can force as
  // it forces a conditional divert; then the branch's content, after the
  // newline a branch that is not inline starts with, and a jump to `end`.
  // The true branch of a `{ cond: a | b }` conditional tests the
  // conditional's own value, which it consumes.
  public EmitBranch(emitter: ProgramEmitter, end: ProgramLabel): void {
    const duplicatesStackValue = this.matchingEquality && !this.isElse;
    if (duplicatesStackValue) {
      emitter.emit(Op.Dup);
    }
    let skip: ProgramLabel | null = null;
    if (!this.isElse) {
      if (!this.isTrueBranch) {
        // A branch with no expression of its own (a keyless arm of a
        // `match`) tests what is on the stack, as the current engine's
        // conditional divert does.
        if (this.ownExpression) {
          emitter.emitObject(this.ownExpression);
        }
        if (this.matchingEquality) {
          emitter.emit(Op.Native, emitter.string("=="), 2);
        }
      }
      skip = emitter.jump(Op.JumpIfFalse, JUMP_DECISION);
    }
    if (!this.isInline) {
      emitter.emit(Op.Newline);
    }
    if (duplicatesStackValue || (this.isElse && this.matchingEquality)) {
      emitter.emit(Op.Pop);
    }
    emitter.emitBranchBody(this);
    emitter.jumpBack(Op.Jump, end);
    if (skip) {
      emitter.bind(skip);
    }
  }

  public override ResolveWith(context: Story): void {
    if (!this.isPrepared) {
      throw new Error();
    }

    super.ResolveWith(context);
  }
}
