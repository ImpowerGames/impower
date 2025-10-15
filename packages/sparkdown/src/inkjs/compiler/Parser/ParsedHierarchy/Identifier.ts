import { DebugMetadata } from "../../../engine/DebugMetadata";

export class Identifier {
  public name: string;
  public debugMetadata: DebugMetadata | null = null;
  public sourceDebugMetadata: DebugMetadata | null = null;
  public alreadyHadError: boolean = false;
  public alreadyHadWarning: boolean = false;

  constructor(name: string | Identifier) {
    if (typeof name === "string") {
      this.name = name;
    } else {
      this.name = name.name;
      if (name.debugMetadata) {
        this.debugMetadata = new DebugMetadata(name.debugMetadata);
      }
    }
  }

  get typeName(): string {
    return "Identifier";
  }

  public static Done(): Identifier {
    return new Identifier("DONE");
  }

  public readonly toString = (): string => this.name || "undefined identifer";
}
