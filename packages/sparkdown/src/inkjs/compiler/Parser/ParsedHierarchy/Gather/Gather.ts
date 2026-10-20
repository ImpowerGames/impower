import type { INamedContent } from "../../../../../runtime/INamedContent";
import type { IWeavePoint } from "../IWeavePoint";
import { ParsedObject } from "../Object";
import { Story } from "../Story";
import { SymbolType } from "../SymbolType";
import { Identifier } from "../Identifier";
import {
  weavePointResolutionKey,
  weavePointSymbolName,
} from "../weavePointSymbol";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

export class Gather extends ParsedObject implements INamedContent, IWeavePoint {
  get name(): string | null {
    return this.identifier?.name || null;
  }

  public uuid?: string;

  // The end of a `choose` block that offers choices: the flow stops before it
  // when the block offered a choice, enters it inline otherwise, and runs
  // on out of it, so it is never a loose end.
  public endsChooseBlock = false;

  constructor(
    identifier: Identifier | null,
    public readonly indentationDepth: number,
  ) {
    super();

    if (identifier) this.identifier = identifier;
  }

  override get typeName(): string {
    return "Gather";
  }

  /** A label's symbol: its flow's name and its own, joined by a dot, or its
   *  own alone at the story's top level. An unnamed gather, and a label
   *  inside a function, have none. */
  public override get programSymbolName(): string | null {
    return weavePointSymbolName(this, this.name);
  }

  /** What a label's chunk records of how its name resolved: the qualified
   *  name of the symbol it exports. */
  get programResolutionKey(): string {
    return weavePointResolutionKey(this);
  }

  // A label is a chunk of its own that exports its symbol at the `Visit`
  // that counts it, so a jump to it and a pass through it both count it
  // (docs/engine/binary-program.md, sections 4 and 5). An unnamed gather is
  // no position anything names, and emits only what it holds.
  public override EmitProgram(emitter: ProgramEmitter): void {
    if (this.name) {
      // The label's symbol is its flow's name and its own, so a chunk is
      // kept only while the label belongs to the flow it was emitted in.
      emitter.recordResolution(this.programResolutionKey);
      const symbol = emitter.labelSymbol(this);
      emitter.exportHere(symbol);
      emitter.emit(Op.Visit, symbol);
    }
    emitter.emitObjects(this.content);
  }

  protected override Prepare(): boolean {
    for (const c of this.content ?? []) {
      c.prepare();
    }
    return true;
  }

  public override ResolveWith(context: Story): void {
    super.ResolveWith(context);

    if (this.identifier && (this.identifier.name || "").length > 0) {
      context.CheckForNamingCollisions(
        this,
        this.identifier,
        SymbolType.SubFlowAndWeave,
      );
    }
  }

  public override readonly toString = (): string =>
    `- ${this.identifier?.name ? "(" + this.identifier?.name + ")" : "gather"}`;
}
