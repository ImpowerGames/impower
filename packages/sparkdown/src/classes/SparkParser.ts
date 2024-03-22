import { Compiler, Tree } from "../../../grammar-compiler/src/compiler";
import { NodeID } from "../../../grammar-compiler/src/core";
import { Grammar } from "../../../grammar-compiler/src/grammar";
import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";
import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkProgram } from "../types/SparkProgram";
import { SparkdownNodeName } from "../types/SparkdownNodeName";
import declare from "../utils/declare";

export default class SparkParser {
  config: SparkParserConfig = {};

  grammar: Grammar;

  compiler: Compiler;

  constructor(config: SparkParserConfig) {
    this.config = config || this.config;
    this.grammar = new Grammar(GRAMMAR_DEFINITION);
    this.compiler = new Compiler(this.grammar);
  }

  parse(script: string, config?: SparkParserConfig): SparkProgram {
    const tree = this.compile(script);
    let parseConfig = config
      ? {
          ...this.config,
          ...config,
        }
      : this.config;
    const program = declare(
      script,
      tree,
      this.grammar.nodeNames as SparkdownNodeName[],
      parseConfig
    );
    // console.log(program);
    return program;
  }

  compile(script: string): Tree {
    // Pad script with newline to ensure any open scopes are closed by the end of the script.
    let paddedScript = script + "\n";
    const result = this.compiler.compile(paddedScript);
    if (!result) {
      throw new Error("Could not compile sparkdown script");
    }
    const topID = NodeID.top;
    const buffer = result.cursor;
    const reused = result.reused;
    const tree = Tree.build({
      topID,
      buffer,
      reused,
    });
    // console.log(printTree(tree, paddedScript, this.grammar.nodeNames));
    return tree;
  }
}
