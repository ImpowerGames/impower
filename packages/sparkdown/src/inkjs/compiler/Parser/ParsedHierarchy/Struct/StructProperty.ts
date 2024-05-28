import { StructDefinition } from "./StructDefinition";
import { ParsedObject } from "../Object";
import { InkObject as RuntimeObject } from "../../../../engine/Object";
import { Identifier } from "../Identifier";

export class StructProperty extends ParsedObject {
  override get typeName(): string {
    return "StructProperty";
  }

  get fullName(): string {
    const parentStruct = this.parent as StructDefinition;
    if (parentStruct === null) {
      throw new Error("Can't get full name without a parent struct.");
    }

    return `${parentStruct.identifier?.name}.${this.name}`;
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

  public override readonly toString = (): string => this.fullName;
}
