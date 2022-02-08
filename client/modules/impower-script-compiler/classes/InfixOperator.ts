export class InfixOperator {
  type: string = null;

  precedence = 0;

  requireWhitespace = false;

  constructor(type: string, precedence: number, requireWhitespace: boolean) {
    this.type = type;
    this.precedence = precedence;
    this.requireWhitespace = requireWhitespace;
  }

  ToString(): string {
    return this.type;
  }
}
