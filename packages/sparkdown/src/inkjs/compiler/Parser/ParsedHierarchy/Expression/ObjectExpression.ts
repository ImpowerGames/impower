import { Container as RuntimeContainer } from "../../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../../engine/ControlCommand";
import { Expression } from "./Expression";
import { ParsedObject } from "../Object";
import { Text } from "../Text";
import { StringExpression } from "./StringExpression";

// An entry in an ObjectExpression. The `key` is either a plain string
// (identifier keys, static bracket keys, array positions) or an
// Expression for COMPUTED bracket keys (`{[1+2] = 4}`) — evaluated at
// runtime, with EndObject stringifying the popped key value to the
// canonical map-key form.
export class ObjectExpressionEntry {
  constructor(
    public readonly key: string | Expression,
    public readonly value: Expression,
  ) {}
}

// Lowering of Luau table literals. Built at compile time as a list of
// (key, value-expression) pairs; emitted at runtime as a BeginObject marker,
// then for each entry the key (a StringValue for static keys, or the
// computed key expression's result) plus the evaluated value-expression,
// followed by EndObject which assembles the ObjectValue.
export class ObjectExpression extends Expression {
  private _entries: ObjectExpressionEntry[];

  constructor(entries?: ObjectExpressionEntry[]) {
    super();
    this._entries = entries ?? [];
    for (const entry of this._entries) {
      if (entry.key instanceof Expression) {
        this.AddContent(entry.key);
      }
      this.AddContent(entry.value);
    }
  }

  get entries(): readonly ObjectExpressionEntry[] {
    return this._entries;
  }

  get typeName(): string {
    return "Object";
  }

  public readonly GenerateIntoContainer = (
    container: RuntimeContainer,
  ): void => {
    container.AddContent(RuntimeControlCommand.BeginObject());
    for (const entry of this._entries) {
      if (entry.key instanceof Expression) {
        // Computed key (`[expr] =`) — evaluate at runtime; EndObject
        // stringifies whatever value lands on the stack.
        entry.key.GenerateIntoContainer(container);
      } else {
        // Static key — emitted by lowering a single-segment
        // StringExpression so the BeginString/EndString machinery
        // yields a StringValue on the eval stack.
        const keyExpr = new StringExpression([new Text(entry.key)]);
        this.AddContent(keyExpr);
        keyExpr.GenerateIntoContainer(container);
      }
      // Value — already an Expression. Generate its runtime form inline so
      // its result lands on the eval stack right after the key.
      entry.value.GenerateIntoContainer(container);
    }
    container.AddContent(RuntimeControlCommand.EndObject());
  };

  public readonly toString = (): string => {
    if (this._entries.length === 0) return "{}";
    return `{${this._entries
      .map((e) => `${e.key.toString()} = ${e.value.toString()}`)
      .join(", ")}}`;
  };

  public Equals(obj: ParsedObject): boolean {
    if (!(obj instanceof ObjectExpression)) return false;
    if (obj._entries.length !== this._entries.length) return false;
    for (let i = 0; i < this._entries.length; i++) {
      const a = this._entries[i]!;
      const b = obj._entries[i]!;
      if (a.key instanceof Expression || b.key instanceof Expression) {
        if (
          !(a.key instanceof Expression) ||
          !(b.key instanceof Expression) ||
          !a.key.Equals(b.key)
        ) {
          return false;
        }
      } else if (a.key !== b.key) {
        return false;
      }
      if (!a.value.Equals(b.value)) return false;
    }
    return true;
  }
}
