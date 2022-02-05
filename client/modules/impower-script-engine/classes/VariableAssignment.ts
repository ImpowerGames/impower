import { RuntimeObject } from "./RuntimeObject";

export class VariableAssignment extends RuntimeObject {
  public readonly variableName: string;

  public readonly isNewDeclaration: boolean;

  public isGlobal: boolean;

  constructor(variableName: string, isNewDeclaration: boolean) {
    super();
    this.variableName = variableName || null;
    this.isNewDeclaration = !!isNewDeclaration;
    this.isGlobal = false;
  }

  public toString(): string {
    return `VarAssign to ${this.variableName}`;
  }
}
