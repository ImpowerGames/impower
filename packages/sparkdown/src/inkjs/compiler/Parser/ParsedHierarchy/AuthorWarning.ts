import { ParsedObject } from "./Object";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";

export class AuthorWarning extends ParsedObject {
  constructor(public readonly warningMessage: string) {
    super();
  }

  override get typeName(): string {
    return "AuthorWarning";
  }

  // The warning is a diagnostic of the compile, which raises it; the
  // statement runs nothing for it.
  public override EmitProgram(_emitter: ProgramEmitter): void {}

  protected override Prepare(): boolean {
    this.Warning(this.warningMessage);
    return false;
  }

  public readonly GenerateRuntimeObject = (): null => {
    this.Warning(this.warningMessage);
    return null;
  };
}
