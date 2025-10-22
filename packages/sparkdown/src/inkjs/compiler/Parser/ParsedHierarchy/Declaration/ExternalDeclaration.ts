import { INamedContent } from "../../../../engine/INamedContent";
import { ParsedObject } from "../Object";
import { InkObject as RuntimeObject } from "../../../../engine/Object";
import { Identifier } from "../Identifier";

export class ExternalDeclaration extends ParsedObject implements INamedContent {
  public get name(): string | null {
    return this.identifier?.name || null;
  }

  constructor(
    identifier: Identifier,
    public readonly argumentNames: string[]
  ) {
    super();
    this.identifier = identifier;
  }

  get typeName(): string {
    return "external";
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject | null => {
    this.story.AddExternal(this);

    // No runtime code exists for an external, only metadata
    return null;
  };

  public toString(): string {
    return `external ${this.identifier?.name}`;
  }
}
