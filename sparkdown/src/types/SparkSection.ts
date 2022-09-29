import { SparkAsset } from "./SparkAsset";
import { SparkTag } from "./SparkTag";
import { SparkToken } from "./SparkToken";
import { SparkVariable } from "./SparkVariable";

export interface SparkSection {
  type: "section" | "function" | "method" | "detector";
  name: string;
  from: number;
  to: number;
  line: number;
  level: number;
  indent: number;
  index: number;
  returnType?: "string" | "number" | "boolean" | "";
  parent?: string;
  value?: number;
  triggers?: string[];
  children?: string[];
  tokens?: SparkToken[];
  variables?: Record<string, SparkVariable>;
  tags?: Record<string, SparkTag>;
  assets?: Record<string, SparkAsset>;
}
