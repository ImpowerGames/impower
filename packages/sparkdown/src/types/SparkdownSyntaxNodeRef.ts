import { type SyntaxNodeRef } from "@lezer/common";
import { type SparkdownNodeName } from "./SparkdownNodeName";

export type SparkdownSyntaxNodeRef = SyntaxNodeRef & {
  name: SparkdownNodeName;
};
