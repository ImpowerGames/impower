/** The struct definitions by type, then by name, each the struct's value:
 *  the table a story's `structDefinitions` holds. */
export type StructDefinitionTable = Record<string, Record<string, any>>;

/** The table of `structs`: a struct with no type is left out, and one with
 *  a type but no name makes its type's entry only. */
export const structDefinitionTable = (
  structs: readonly StructDefinition[],
): StructDefinitionTable => {
  const table: StructDefinitionTable = {};
  for (const struct of structs) {
    const type = struct.type;
    const name = struct.name;
    if (type) {
      table[type] ??= {};
      if (name) {
        table[type][name] = struct.value;
      }
    }
  }
  return table;
};

export class StructDefinition {
  protected _type: string;
  get type() {
    return this._type;
  }

  protected _name: string;
  get name() {
    return this._name;
  }

  protected _value: any;
  get value() {
    return this._value;
  }

  constructor(type: string, name: string, value: any) {
    this._type = type || "";
    this._name = name || "";
    this._value = value;
  }
}
