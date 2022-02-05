import { Container, RuntimeObject } from "../../../impower-script-engine";
import { Identifier } from "../../types/Identifier";
import { INamedContent } from "../../types/INamedContent";
import { IStory } from "../../types/IStory";
import { IWeavePoint } from "../../types/IWeavePoint";
import { SymbolType } from "../../types/SymbolType";
import { ParsedObject } from "./ParsedObject";

export class ParsedGather
  extends ParsedObject
  implements IWeavePoint, INamedContent
{
  identifier: Identifier = null;

  indentationDepth = 0;

  get name(): string {
    return this.identifier?.name;
  }

  get runtimeContainer(): Container {
    return this.runtimeObject as Container;
  }

  constructor(identifier: Identifier, indentationDepth: number) {
    super();
    this.identifier = identifier;
    this.indentationDepth = indentationDepth;
  }

  override GenerateRuntimeObject(): RuntimeObject {
    const container = new Container();
    container.name = this.name;

    if (this.story.countAllVisits) {
      container.visitsShouldBeCounted = true;
    }

    container.countingAtStartOnly = true;

    // A gather can have null content, e.g. it's just purely a line with "-"
    if (this.content != null) {
      this.content.forEach((c) => {
        container.AddContent(c.runtimeObject);
      });
    }

    return container;
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    if (this.identifier != null && this.identifier.name.length > 0)
      context.CheckForNamingCollisions(
        this,
        this.identifier,
        SymbolType.SubFlowAndWeave
      );
  }
}
