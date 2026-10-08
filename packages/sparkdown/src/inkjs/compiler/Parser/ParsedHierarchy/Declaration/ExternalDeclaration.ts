import type { INamedContent } from "../../../../../runtime/INamedContent";
import { ParsedObject } from "../Object";
import { InkObject as RuntimeObject } from "../../../../../runtime/Object";
import { Identifier } from "../Identifier";
import { resolutionTap } from "../ResolutionTap";

export class ExternalDeclaration extends ParsedObject implements INamedContent {
  public get name(): string | null {
    return this.identifier?.name || null;
  }

  constructor(
    identifier: Identifier,
    public readonly argumentNames: string[],
  ) {
    super();
    this.identifier = identifier;
  }

  override get typeName(): string {
    return "external";
  }

  /** Adds the declaration to the story's externals, which every compile
   *  builds anew; the program path's resolver adds it again for a statement
   *  it does not generate again (`ResolutionTap.external`). */
  public readonly RegisterExternal = (): void => {
    this.story.AddExternal(this);
  };

  public readonly GenerateRuntimeObject = (): RuntimeObject | null => {
    const tap = resolutionTap();
    if (tap) {
      tap.external(this, this.RegisterExternal);
    } else {
      this.RegisterExternal();
    }

    // No runtime code exists for an external, only metadata
    return null;
  };

  public override toString(): string {
    return `external ${this.identifier?.name}`;
  }
}
