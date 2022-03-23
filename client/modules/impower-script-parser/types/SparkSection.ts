import { SparkAsset } from "./SparkAsset";
import { SparkEntity } from "./SparkEntity";
import { SparkTag } from "./SparkTag";
import { SparkToken } from "./SparkToken";
import { SparkVariable } from "./SparkVariable";

export interface SparkSection {
  type?: "section" | "function" | "method" | "detector";
  name?: string;
  from?: number;
  to?: number;
  line?: number;
  level?: number;
  returnType?: "string" | "number" | "boolean" | "";
  tokens?: SparkToken[];
  children?: string[];
  triggers?: string[];
  variables?: Record<string, SparkVariable>;
  entities?: Record<string, SparkEntity>;
  tags?: Record<string, SparkTag>;
  assets?: Record<string, SparkAsset>;
  value?: number;
}
