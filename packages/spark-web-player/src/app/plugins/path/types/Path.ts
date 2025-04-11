export type TokenType = 0 | 1 | 2;

export type PathData = [number, number, number, number, number, number, number];

export interface PathToken {
  type: TokenType;
  text: string;
}

export interface PathCommand {
  command: string;
  data: PathData;
}
