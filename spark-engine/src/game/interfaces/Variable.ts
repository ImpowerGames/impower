export interface Variable {
  from: number;
  to: number;
  line: number;
  name: string;
  type:
    | "string"
    | "number"
    | "boolean"
    | "list"
    | "map"
    | "ui"
    | "style"
    | "config";
  value: unknown;
  parameter: boolean;
  scope: "public" | "protected" | "private";
}
