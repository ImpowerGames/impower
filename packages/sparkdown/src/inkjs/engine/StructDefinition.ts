export class StructDefinition {
  protected _id: string;
  get id() {
    return this._id;
  }

  protected _value: any;
  get value() {
    return this._value;
  }

  constructor(id: string, value: any) {
    this._id = id || "";
    this._value = value;
  }
}
