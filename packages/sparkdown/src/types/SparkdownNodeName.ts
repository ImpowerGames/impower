import type { NodeName } from "../../../grammar-compiler/src/grammar/types/NodeName";
import type GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";

export type SparkdownRule =
  | "sparkdown"
  | keyof typeof GRAMMAR_DEFINITION.repository;

export type SparkdownNodeName = NodeName<SparkdownRule>;
