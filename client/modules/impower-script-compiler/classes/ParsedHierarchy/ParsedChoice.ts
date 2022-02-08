import {
  ChoicePoint,
  Container,
  ControlCommand,
  Divert,
  DivertTargetValue,
  Path,
  RuntimeObject,
  VariableAssignment,
} from "../../../impower-script-engine";
import { IChoice } from "../../types/IChoice";
import { Identifier } from "../../types/Identifier";
import { INamedContent } from "../../types/INamedContent";
import { IStory } from "../../types/IStory";
import { IWeavePoint } from "../../types/IWeavePoint";
import { SymbolType } from "../../types/SymbolType";
import { ParsedContentList } from "./ParsedContentList";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedObject } from "./ParsedObject";

export class ParsedChoice
  extends ParsedObject
  implements IWeavePoint, INamedContent, IChoice
{
  startContent: ParsedContentList = null;

  choiceOnlyContent: ParsedContentList = null;

  innerContent: ParsedContentList = null;

  identifier: Identifier = null;

  onceOnly = false;

  isInvisibleDefault = false;

  hasWeaveStyleInlineBrackets = false;

  indentationDepth = 0;

  private _runtimeChoice: ChoicePoint = null;

  private _innerContentContainer: Container = null;

  private _outerContainer: Container = null;

  private _startContentRuntimeContainer: Container = null;

  private _divertToStartContentOuter: Divert = null;

  private _divertToStartContentInner: Divert = null;

  private _r1Label: Container = null;

  private _r2Label: Container = null;

  private _returnToR1: DivertTargetValue = null;

  private _returnToR2: DivertTargetValue = null;

  private _condition: ParsedExpression = null;

  get condition(): ParsedExpression {
    return this._condition;
  }

  set condition(value: ParsedExpression) {
    this._condition = value;
    if (this._condition) {
      this.AddContent(this._condition);
    }
  }

  get name(): string {
    return this.identifier?.name;
  }

  // Required for IWeavePoint interface
  // Choice's target container. Used by weave to append any extra
  // nested weave content into.
  get runtimeContainer(): Container {
    return this._innerContentContainer;
  }

  get innerContentContainer(): Container {
    return this._innerContentContainer;
  }

  override get containerForCounting(): Container {
    return this._innerContentContainer;
  }

  // Override runtimePath to point to the Choice's target content (after it's chosen),
  // as opposed to the default implementation which would point to the choice itself
  // (or it's outer container), which is what runtimeObject is.
  override get runtimePath(): Path {
    return this._innerContentContainer.path;
  }

  constructor(
    startContent: ParsedContentList,
    choiceOnlyContent: ParsedContentList,
    innerContent: ParsedContentList
  ) {
    super();
    this.startContent = startContent;
    this.choiceOnlyContent = choiceOnlyContent;
    this.innerContent = innerContent;
    this.indentationDepth = 1;

    if (startContent) {
      this.AddContent(this.startContent);
    }

    if (choiceOnlyContent) {
      this.AddContent(this.choiceOnlyContent);
    }

    if (innerContent) {
      this.AddContent(this.innerContent);
    }

    this.onceOnly = true; // default
  }

  override GenerateRuntimeObject(): RuntimeObject {
    this._outerContainer = new Container();

    // Content names for different types of choice:
    //  * start content [choice only content] inner content
    //  * start content   -> divert
    //  * start content
    //  * [choice only content]

    // Hmm, this structure has become slightly insane!
    //
    // [
    //     EvalStart
    //     assign $r = $r1   -- return target = return label 1
    //     BeginString
    //     -> s
    //     [(r1)]            -- return label 1 (after start content)
    //     EndString
    //     BeginString
    //     ... choice only content
    //     EndEval
    //     Condition expression
    //     choice: -> "c-0"
    //     (s) = [
    //         start content
    //         -> r          -- goto return label 1 or 2
    //     ]
    //  ]
    //
    //  in parent's container: (the inner content for the choice)
    //
    //  (c-0) = [
    //      EvalStart
    //      assign $r = $r2   -- return target = return label 2
    //      EndEval
    //      -> s
    //      [(r2)]            -- return label 1 (after start content)
    //      inner content
    //  ]
    //

    this._runtimeChoice = new ChoicePoint(this.onceOnly);
    this._runtimeChoice.isInvisibleDefault = this.isInvisibleDefault;

    if (this.startContent || this.choiceOnlyContent || this.condition) {
      this._outerContainer.AddContent(ControlCommand.EvalStart());
    }

    // Start content is put into a named container that's referenced both
    // when displaying the choice initially, and when generating the text
    // when the choice is chosen.
    if (this.startContent) {
      // Generate start content and return
      //  - We can't use a function since it uses a call stack element, which would
      //    put temporary values out of scope. Instead we manually divert around.
      //  - $r is a variable divert target contains the return point
      this._returnToR1 = new DivertTargetValue();
      this._outerContainer.AddContent(this._returnToR1);
      const varAssign = new VariableAssignment("$r", true);
      this._outerContainer.AddContent(varAssign);

      // Mark the start of the choice text generation, so that the runtime
      // knows where to rewind to to extract the content from the output stream.
      this._outerContainer.AddContent(ControlCommand.BeginString());

      this._divertToStartContentOuter = new Divert();
      this._outerContainer.AddContent(this._divertToStartContentOuter);

      // Start content itself in a named container
      this._startContentRuntimeContainer =
        this.startContent.GenerateRuntimeObject() as Container;
      this._startContentRuntimeContainer.name = "s";

      // Effectively, the "return" statement - return to the point specified by $r
      const varDivert = new Divert();
      varDivert.variableDivertName = "$r";
      this._startContentRuntimeContainer.AddContent(varDivert);

      // Add the container
      this._outerContainer.AddToNamedContentOnly(
        this._startContentRuntimeContainer
      );

      // This is the label to return to
      this._r1Label = new Container();
      this._r1Label.name = "$r1";
      this._outerContainer.AddContent(this._r1Label);

      this._outerContainer.AddContent(ControlCommand.EndString());

      this._runtimeChoice.hasStartContent = true;
    }

    // Choice only content - mark the start, then generate it directly into the outer container
    if (this.choiceOnlyContent) {
      this._outerContainer.AddContent(ControlCommand.BeginString());

      const choiceOnlyRuntimeContent =
        this.choiceOnlyContent.GenerateRuntimeObject() as Container;
      this._outerContainer.AddContentsOfContainer(choiceOnlyRuntimeContent);

      this._outerContainer.AddContent(ControlCommand.EndString());

      this._runtimeChoice.hasChoiceOnlyContent = true;
    }

    // Generate any condition for this choice
    if (this.condition) {
      this.condition.GenerateIntoContainer(this._outerContainer);
      this._runtimeChoice.hasCondition = true;
    }

    if (this.startContent || this.choiceOnlyContent || this.condition) {
      this._outerContainer.AddContent(ControlCommand.EvalEnd());
    }

    // Add choice itself
    this._outerContainer.AddContent(this._runtimeChoice);

    // Container that choice points to for when it's chosen
    this._innerContentContainer = new Container();

    // Repeat start content by diverting to its container
    if (this.startContent) {
      // Set the return point when jumping back into the start content
      //  - In this case, it's the $r2 point, within the choice content "c".
      this._returnToR2 = new DivertTargetValue();
      this._innerContentContainer.AddContent(ControlCommand.EvalStart());
      this._innerContentContainer.AddContent(this._returnToR2);
      this._innerContentContainer.AddContent(ControlCommand.EvalEnd());
      const varAssign = new VariableAssignment("$r", true);
      this._innerContentContainer.AddContent(varAssign);

      // Main divert into start content
      this._divertToStartContentInner = new Divert();
      this._innerContentContainer.AddContent(this._divertToStartContentInner);

      // Define label to return to
      this._r2Label = new Container();
      this._r2Label.name = "$r2";
      this._innerContentContainer.AddContent(this._r2Label);
    }

    // Choice's own inner content
    if (this.innerContent) {
      const innerChoiceOnlyContent =
        this.innerContent.GenerateRuntimeObject() as Container;
      this._innerContentContainer.AddContentsOfContainer(
        innerChoiceOnlyContent
      );
    }

    if (this.story.countAllVisits) {
      this._innerContentContainer.visitsShouldBeCounted = true;
    }

    this._innerContentContainer.countingAtStartOnly = true;

    return this._outerContainer;
  }

  override ResolveReferences(context: IStory): void {
    // Weave style choice - target own content container
    if (this._innerContentContainer) {
      this._runtimeChoice.pathOnChoice = this._innerContentContainer.path;

      if (this.onceOnly) {
        this._innerContentContainer.visitsShouldBeCounted = true;
      }
    }

    if (this._returnToR1) {
      this._returnToR1.targetPath = this._r1Label.path;
    }

    if (this._returnToR2) {
      this._returnToR2.targetPath = this._r2Label.path;
    }

    if (this._divertToStartContentOuter) {
      this._divertToStartContentOuter.targetPath =
        this._startContentRuntimeContainer.path;
    }

    if (this._divertToStartContentInner) {
      this._divertToStartContentInner.targetPath =
        this._startContentRuntimeContainer.path;
    }

    super.ResolveReferences(context);

    if (this.identifier != null && this.identifier.name.length > 0) {
      context.CheckForNamingCollisions(
        this,
        this.identifier,
        SymbolType.SubFlowAndWeave
      );
    }
  }

  override ToString(): string {
    if (this.choiceOnlyContent != null) {
      return `* ${this.startContent}[${this.choiceOnlyContent}]...`;
    }
    return `* ${this.startContent}...`;
  }
}
