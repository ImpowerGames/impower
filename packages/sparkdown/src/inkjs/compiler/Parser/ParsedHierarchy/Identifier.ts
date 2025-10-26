import { DebugMetadata } from "../../../engine/DebugMetadata";

export class Identifier {
  public name: string;
  public debugMetadata: DebugMetadata | null = null;
  public alreadyHadError: boolean = false;
  public alreadyHadWarning: boolean = false;

  constructor(...names: string[] | Identifier[]) {
    for (const name of names) {
      if (typeof name === "string") {
        this.name ??= "";
        this.name += name;
      } else {
        this.name ??= "";
        this.name += name.name;
        if (name.debugMetadata) {
          this.debugMetadata ??= new DebugMetadata(name.debugMetadata);
          if (name.debugMetadata.filePath === this.debugMetadata.filePath) {
            if (
              name.debugMetadata.startLineNumber <
              this.debugMetadata.startLineNumber
            ) {
              this.debugMetadata.startLineNumber =
                name.debugMetadata.startLineNumber;
              this.debugMetadata.startCharacterNumber =
                name.debugMetadata.startCharacterNumber;
            } else if (
              name.debugMetadata.startLineNumber ===
                this.debugMetadata.startLineNumber &&
              name.debugMetadata.startCharacterNumber <
                this.debugMetadata.startCharacterNumber
            ) {
              this.debugMetadata.startCharacterNumber =
                name.debugMetadata.startCharacterNumber;
            }
            if (
              name.debugMetadata.endLineNumber >
              this.debugMetadata.endLineNumber
            ) {
              this.debugMetadata.endLineNumber =
                name.debugMetadata.endLineNumber;
              this.debugMetadata.endCharacterNumber =
                name.debugMetadata.endCharacterNumber;
            } else if (
              name.debugMetadata.endLineNumber ===
                this.debugMetadata.endLineNumber &&
              name.debugMetadata.endCharacterNumber <
                this.debugMetadata.endCharacterNumber
            ) {
              this.debugMetadata.endCharacterNumber =
                name.debugMetadata.endCharacterNumber;
            }
          }
        }
      }
    }
    this.name ??= "";
  }

  get typeName(): string {
    return "Identifier";
  }

  get hasOwnDebugMetadata() {
    return true;
  }

  public static Done(): Identifier {
    return new Identifier("DONE");
  }

  public readonly toString = (): string => this.name || "undefined identifer";

  
  public ResetRuntime() {
    this.alreadyHadError = false;
    this.alreadyHadWarning = false;
    this.OnResetRuntime();
  }

  public OnResetRuntime() {}
}
