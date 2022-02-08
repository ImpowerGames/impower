import {
  Container,
  ControlCommand,
  Divert,
  NativeFunctionCall,
  RuntimeObject,
  StringValue,
} from "../../../impower-script-engine";
import { IStory } from "../../types/IStory";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedObject } from "./ParsedObject";
import { ParsedText } from "./ParsedText";
import { ParsedWeave } from "./ParsedWeave";

export class ParsedConditionalSingleBranch extends ParsedObject {
  // bool condition, e.g.:
  // { 5 == 4:
  //   - the true branch
  //   - the false branch
  // }
  isTrueBranch = false;

  // When each branch has its own expression like a switch statement,
  // this is non-null. e.g.
  // { x:
  //    - 4: the value of x is four (ownExpression is the value 4)
  //    - 3: the value of x is three
  // }
  get ownExpression(): ParsedExpression {
    return this._ownExpression;
  }

  set ownExpression(value: ParsedExpression) {
    this._ownExpression = value;
    if (this._ownExpression) {
      this.AddContent(this._ownExpression);
    }
  }

  // In the above example, match equality of x with 4 for the first branch.
  // This is as opposed to simply evaluating boolean equality for each branch,
  // example when shouldMatchEqualtity is FALSE:
  // {
  //    3 > 2:  This will happen
  //    2 > 3:  This won't happen
  // }
  matchingEquality = false;

  isElse = false;

  isInline = false;

  returnDivert: Divert = null;

  private _contentContainer: Container = null;

  private _conditionalDivert: Divert = null;

  private _ownExpression: ParsedExpression = null;

  private _innerWeave: ParsedWeave = null;

  constructor(content: ParsedObject[]) {
    super();
    // Branches are allowed to be empty
    if (this.content != null) {
      this._innerWeave = new ParsedWeave(content);
      this.AddContent(this._innerWeave);
    }
  }

  // Runtime content can be summarised as follows:
  //  - Evaluate an expression if necessary to branch on
  //  - Branch to a named container if true
  //       - Divert back to main flow
  //         (owner Conditional is in control of this target point)
  override GenerateRuntimeObject(): RuntimeObject {
    // Check for common mistake, of putting "else:" instead of "- else:"
    if (this._innerWeave) {
      this._innerWeave.content.forEach((c) => {
        const text = c;
        if (text instanceof ParsedText) {
          // Don't need to trim at the start since the parser handles that already
          if (text.text.startsWith("else:")) {
            this.Warning(
              "Saw the text 'else:' which is being treated as content. Did you mean '- else:'?",
              text
            );
          }
        }
      });
    }

    const container = new Container();

    // Are we testing against a condition that's used for more than just this
    // branch? If so, the first thing we need to do is replicate the value that's
    // on the evaluation stack so that we don't fully consume it, in case other
    // branches need to use it.
    const duplicatesStackValue = this.matchingEquality && !this.isElse;
    if (duplicatesStackValue) {
      container.AddContent(ControlCommand.Duplicate());
    }

    this._conditionalDivert = new Divert();

    // else clause is unconditional catch-all, otherwise the divert is conditional
    this._conditionalDivert.isConditional = !this.isElse;

    // Need extra evaluation?
    if (!this.isTrueBranch && !this.isElse) {
      const needsEval = this.ownExpression != null;
      if (needsEval) {
        container.AddContent(ControlCommand.EvalStart());
      }

      if (this.ownExpression) {
        this.ownExpression.GenerateIntoContainer(container);
      }

      // Uses existing duplicated value
      if (this.matchingEquality) {
        container.AddContent(NativeFunctionCall.CallWithName("=="));
      }

      if (needsEval) {
        container.AddContent(ControlCommand.EvalEnd());
      }
    }

    // Will pop from stack if conditional
    container.AddContent(this._conditionalDivert);

    this._contentContainer = this.GenerateRuntimeForContent();
    this._contentContainer.name = "b";

    // Multi-line conditionals get a newline at the start of each branch
    // (as opposed to the start of the multi-line conditional since the condition
    //  may evaluate to false.)
    if (!this.isInline) {
      this._contentContainer.InsertContent(new StringValue("\n"), 0);
    }

    if (duplicatesStackValue || (this.isElse && this.matchingEquality))
      this._contentContainer.InsertContent(
        ControlCommand.PopEvaluatedValue(),
        0
      );

    container.AddToNamedContentOnly(this._contentContainer);

    this.returnDivert = new Divert();
    this._contentContainer.AddContent(this.returnDivert);

    return container;
  }

  GenerateRuntimeForContent(): Container {
    // Empty branch - create empty container
    if (this._innerWeave == null) {
      return new Container();
    }

    return this._innerWeave.rootContainer;
  }

  override ResolveReferences(context: IStory): void {
    this._conditionalDivert.targetPath = this._contentContainer.path;

    super.ResolveReferences(context);
  }
}
