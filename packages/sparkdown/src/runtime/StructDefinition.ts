export type StructDefinitionTable = Record<string, Record<string, any>>;

export const structDefinitionTable = (
  structs: readonly StructDefinition[],
): StructDefinitionTable => {
  const table: StructDefinitionTable = Object.create(null);
  for (const struct of structs) {
    const type = struct.type;
    const name = struct.name;
    if (type) {
      const definitions: Record<string, any> =
        (table[type] ??= Object.create(null));
      if (name) {
        definitions[name] = struct.value;
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
