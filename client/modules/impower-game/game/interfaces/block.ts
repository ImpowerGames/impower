export interface Block {
  index: number;
  pos: number;
  line: number;
  type?: "section" | "function" | "method" | "detector";
  parent: string;
  children: string[];
  assets: string[];
}
