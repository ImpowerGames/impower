export interface Block {
  index: number;
  pos: number;
  line: number;
  operator: "?" | "*" | "";
  parent: string;
  children: string[];
  assets: string[];
}
