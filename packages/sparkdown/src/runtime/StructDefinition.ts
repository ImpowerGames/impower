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
