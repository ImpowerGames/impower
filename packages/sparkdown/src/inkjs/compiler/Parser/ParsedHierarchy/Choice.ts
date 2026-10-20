import type { INamedContent } from "../../../../runtime/INamedContent";
import { ContentList } from "./ContentList";
import { Expression } from "./Expression/Expression";
import type { IWeavePoint } from "./IWeavePoint";
import { ParsedObject } from "./Object";
import { Story } from "./Story";
import { SymbolType } from "./SymbolType";
import {
  weavePointResolutionKey,
  weavePointSymbolName,
} from "./weavePointSymbol";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";

// Stands where a chosen choice repeats its start content, when that is not the
// start of the choice's inner content: inside the string of a `display()`
// call, so the repeated words are part of the call's text.
export class ChoiceStartEcho extends ParsedObject {
  /** The choice whose start content this repeats. */
  public choice: Choice | null = null;

  override get typeName(): string {
    return "ChoiceStartEcho";
  }

  // The binary program repeats the start content where it stands: its code is
  // emitted a second time, inside the string of the chosen line's call
  // (docs/engine/binary-program.md, section 4).
  public override EmitProgram(emitter: ProgramEmitter): void {
    if (!this.choice) {
      emitter.unsupported(this.typeName);
    }
    emitter.emitObjects(this.choice.startContent.content);
  }

  /** Whether its choice was prepared, which places the echo. */
  public preparedByChoice = false;

  protected override Prepare(): boolean {
    if (!this.preparedByChoice) {
      throw new Error("ChoiceStartEcho generated before its choice");
    }
    return true;
  }
}

export class Choice extends ParsedObject implements IWeavePoint, INamedContent {
  private _condition: Expression | null = null;

  public uuid?: string;
  public startContent: ContentList;
  public choiceOnlyContent: ContentList;
  public innerContent: ContentList;
  get name() {
    return this.identifier?.name || null;
  }
  public onceOnly: boolean;
  public isInvisibleDefault: boolean = false;
  public indentationDepth: number;
  public hasWeaveStyleInlineBrackets: boolean = false;
  // Where the chosen output repeats the start content, when `innerContent`
  // holds it rather than beginning with it.
  public startEcho: ChoiceStartEcho | null = null;
  // False when `innerContent` prints its own copy of the start content, so
  // the chosen output does not jump into the label's.
  public repeatsStartContent: boolean = true;

  get condition() {
    return this._condition;
  }

  set condition(value) {
    this._condition = value;
    if (value) {
      this.AddContent(value as ParsedObject);
    }
  }

  constructor(
    startContent: ContentList,
    choiceOnlyContent: ContentList,
    innerContent: ContentList,
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

  override get typeName(): string {
    return "Choice";
  }

  /** A named choice's symbol, as a label's: its flow's name and its own,
   *  joined by a dot, or its own alone at the story's top level. A choice
   *  with no name counts under an anonymous symbol of its statement. */
  public override get programSymbolName(): string | null {
    return weavePointSymbolName(this, this.name);
  }

  /** What a named choice's chunk records of how its name resolved: the
   *  qualified name of the symbol it exports. */
  get programResolutionKey(): string {
    return weavePointResolutionKey(this);
  }

  // A choice is emitted by the `choose` block that offers it (the writer's
  // `emitObjects`), which this is never reached from.
  public override EmitProgram(emitter: ProgramEmitter): void {
    emitter.unsupported(this.typeName);
  }

  /** The start content, the choice-only content, the condition and the inner
   *  content prepared in its order, and the start content's echo placed. */
  protected override Prepare(): boolean {
    if (this.startContent) {
      this.startContent.PrepareUncached();
    }
    if (this.choiceOnlyContent) {
      this.choiceOnlyContent.PrepareUncached();
    }
    if (this.condition) {
      this.condition.PrepareIntoContainer();
    }
    if (this.startContent && this.repeatsStartContent && this.startEcho) {
      this.startEcho.preparedByChoice = true;
    }
    if (this.innerContent) {
      this.innerContent.PrepareUncached();
    }
    return true;
  }

  public override ResolveWith(context: Story): void {
    super.ResolveWith(context);

    if (this.identifier && (this.identifier?.name || "").length > 0) {
      context.CheckForNamingCollisions(
        this as ParsedObject,
        this.identifier,
        SymbolType.SubFlowAndWeave,
      );
    }
  }

  public override readonly toString = () => {
    if (this.choiceOnlyContent !== null) {
      return `* ${this.startContent}[${this.choiceOnlyContent}]...`;
    }

    return `* ${this.startContent}...`;
  };
}
