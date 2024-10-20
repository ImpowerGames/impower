import { ParsedObject } from "../Object";
import { InkObject as RuntimeObject } from "../../../../engine/Object";
import { Identifier } from "../Identifier";

export class StructProperty extends ParsedObject {
  override get typeName(): string {
    return "StructProperty";
  }

  constructor(
    public readonly identifier: Identifier,
    public readonly level: number,
    public readonly value: unknown | null = null
  ) {
    super();
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    throw new Error("Not implemented.");
  };

  public override readonly toString = (): string => this.identifier.name;
}
