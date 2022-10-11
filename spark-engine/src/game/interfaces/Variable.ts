export interface Variable {
  from: number;
  to: number;
  line: number;
  name: string;
  type:
    | "string"
    | "number"
    | "boolean"
    | "image"
    | "audio"
    | "video"
    | "text"
    | "graphic"
    | "tag";
  value: unknown;
  parameter?: boolean;
  scope?: "public" | "protected" | "private";
}
