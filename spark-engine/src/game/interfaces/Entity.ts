import { Field } from "./Field";

export interface Entity {
  from: number;
  to: number;
  line: number;
  name: string;
  base: string;
  type: "list" | "map" | "ui" | "style" | "config";
  fields: Record<string, Field>;
}
