import { RuntimeObject } from "../../../impower-script-engine";
import { Identifier } from "../../types/Identifier";
import { IExternalDeclaration } from "../../types/IExternalDeclaration";
import { ParsedObject } from "./ParsedObject";

export class ParsedExternalDeclaration
  extends ParsedObject
  implements IExternalDeclaration
{
  identifier: Identifier = null;

  argumentNames: string[] = null;

  get name(): string {
    return this.identifier?.name;
  }

  ExternalDeclaration(identifier: Identifier, argumentNames: string[]): void {
    this.identifier = identifier;
    this.argumentNames = argumentNames;
  }

  override GenerateRuntimeObject(): RuntimeObject {
    this.story.AddExternal(this);

    // No runtime code exists for an external, only metadata
    return null;
  }
}
