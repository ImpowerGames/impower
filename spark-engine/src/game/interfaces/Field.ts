export interface Field {
  from: number;
  to: number;
  line: number;
  name: string;
  type: "string" | "number" | "boolean" | "object";
  value: unknown;
}
