import type { INamedContent } from "../../../../../runtime/INamedContent";
import { ParsedObject } from "../Object";
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
   *  it does not prepare again (`ResolutionTap.external`). */
  public readonly RegisterExternal = (): void => {
    this.story.AddExternal(this);
  };

  /** The external its preparation registers. */
  protected override Prepare(): boolean {
    const tap = resolutionTap();
    if (tap) {
      tap.external(this, this.RegisterExternal);
    } else {
      this.RegisterExternal();
    }
    return false;
  }

  public override toString(): string {
    return `external ${this.identifier?.name}`;
  }
}
