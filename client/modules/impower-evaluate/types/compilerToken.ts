export interface CompilerToken {
  type: "token";
  content: string;
  from: number;
  to: number;
}
