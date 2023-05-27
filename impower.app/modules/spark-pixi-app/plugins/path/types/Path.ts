type TokenType = 0 | 1 | 2;

export interface PathToken {
  type: TokenType;
  text: string;
}

export interface PathCommand {
  command: string;
  data: number[];
}
