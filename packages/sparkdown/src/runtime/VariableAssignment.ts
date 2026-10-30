import { InkObject } from "./Object";

export class VariableAssignment extends InkObject {
  public readonly variableName: string | null;
  public readonly isNewDeclaration: boolean;
  public isGlobal: boolean;
  public isVarargsSlot: boolean;
  public readonly isInitializer: boolean;

  constructor(
    variableName: string | null,
    isNewDeclaration: boolean,
    isVarargsSlot: boolean = false,
    isInitializer: boolean = false,
  ) {
    super();
    this.variableName = variableName || null;
    this.isNewDeclaration = !!isNewDeclaration;
    this.isGlobal = false;
    this.isVarargsSlot = isVarargsSlot;
    this.isInitializer = isInitializer;
  }

  public override toString(): string {
    return "VarAssign to " + this.variableName;
  }
}
