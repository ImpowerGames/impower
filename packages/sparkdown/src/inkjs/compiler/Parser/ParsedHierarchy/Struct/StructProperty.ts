import { ParsedObject } from "../Object";
import { InkObject as RuntimeObject } from "../../../../engine/Object";

export class StructProperty extends ParsedObject {
  override get typeName(): string {
    return "StructProperty";
  }

  constructor(
    public readonly name: string,
    public readonly level: number,
    public readonly value: unknown | null = null,
    public readonly index: number | null = null
  ) {
    super();
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    throw new Error("Not implemented.");
  };

  public override readonly toString = (): string => this.name;
}
