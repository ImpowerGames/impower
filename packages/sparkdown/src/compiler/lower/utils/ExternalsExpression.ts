import { Container as RuntimeContainer } from "../../../inkjs/engine/Container";
import { BoolValue } from "../../../inkjs/engine/Value";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import type { Story } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Story";

// A constant that is true when every name in `names` is an `external` the
// program declares. Externals may be declared in any included script, and the
// story learns all of them only after generation, so the value is settled when
// references are resolved. A change to the program's externals disables flow
// reuse, so a generated value never outlives the declarations it was read
// from.
export class ExternalsExpression extends Expression {
  private _value: BoolValue | null = null;

  constructor(public readonly names: readonly string[]) {
    super();
  }

  override get typeName(): string {
    return "Externals";
  }

  public readonly GenerateIntoContainer = (
    container: RuntimeContainer,
  ): void => {
    this._value = new BoolValue(false);
    container.AddContent(this._value);
  };

  public override ResolveReferences(context: Story): void {
    super.ResolveReferences(context);
    if (this._value) {
      this._value.value = this.names.every((name) => context.IsExternal(name));
    }
  }

  public override readonly toString = (): string =>
    `externals(${this.names.join(", ")})`;
}
