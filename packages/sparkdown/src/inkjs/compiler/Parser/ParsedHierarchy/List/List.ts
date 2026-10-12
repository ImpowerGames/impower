import { Expression } from "../Expression/Expression";
import { Identifier } from "../Identifier";

export class List extends Expression {
  constructor(public readonly itemIdentifierList: Identifier[]) {
    super();
  }

  override get typeName(): string {
    return "List";
  }

  /** Sparkdown builds no list expression (`docs/runtime/DIVERGENCES.md`). */
  public override PrepareIntoContainer(): void {
    throw new Error(`${this.typeName} has no preparation for the program path`);
  }
}
