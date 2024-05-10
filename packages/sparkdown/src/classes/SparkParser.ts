import { Compiler, Tree } from "../../../grammar-compiler/src/compiler";
import { NodeID } from "../../../grammar-compiler/src/core";
import { Grammar } from "../../../grammar-compiler/src/grammar";
import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";
import defaultCompiler from "../defaults/defaultCompiler";
import defaultFormatter from "../defaults/defaultFormatter";
import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkProgram } from "../types/SparkProgram";
import { SparkdownNodeName } from "../types/SparkdownNodeName";
import declareBuiltins from "../utils/declareBuiltins";
import declareFiles from "../utils/declareFiles";
import initializeProgram from "../utils/initializeProgram";
import populateProgram from "../utils/populateProgram";

export default class SparkParser {
  protected _config: SparkParserConfig = {};

  protected _grammar: Grammar;

  protected _compiler: Compiler;

  constructor(config: SparkParserConfig) {
    this._config = config || this._config;
    this._grammar = new Grammar(GRAMMAR_DEFINITION);
    this._compiler = new Compiler(this._grammar);
  }

  configure(config: SparkParserConfig) {
    if (config.builtins && config.builtins !== this._config.builtins) {
      this._config.builtins = config.builtins;
    }
    if (config.files && config.files !== this._config.files) {
      this._config.files = config.files;
    }
    if (config.main && config.main !== this._config.main) {
      this._config.main = config.main;
    }
    if (config.extensions && config.extensions !== this._config.extensions) {
      this._config.extensions = config.extensions;
    }
    if (config.compiler && config.compiler !== this._config.compiler) {
      this._config.compiler = config.compiler;
    }
    if (config.formatter && config.formatter !== this._config.formatter) {
      this._config.formatter = config.formatter;
    }
  }

  parse(script: string, readFile?: (path: string) => string): SparkProgram {
    return this.buildProgram(script, readFile);
  }

  buildTree(script: string): Tree {
    // Pad script with newline to ensure any open scopes are closed by the end of the script.
    let paddedScript = script + "\n";
    const result = this._compiler.compile(paddedScript);
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
    // console.warn(printTree(tree, paddedScript, this.grammar.nodeNames));
    return tree;
  }

  buildProgram(
    script: string,
    readFile?: (path: string) => string
  ): SparkProgram {
    const parseStartTime = Date.now();

    const nodeNames = this._grammar.nodeNames as SparkdownNodeName[];

    const builtins = this._config?.builtins;
    const files = this._config?.files;
    const compiler = this._config?.compiler || defaultCompiler;
    const formatter = this._config?.formatter || defaultFormatter;
    const buildTree = (s: string) => this.buildTree(s);

    const program: SparkProgram = {};
    initializeProgram(program);
    if (builtins) {
      declareBuiltins(program, builtins);
    }
    if (files) {
      declareFiles(program, files);
    }

    // recursively build and populate program
    populateProgram(
      program,
      script,
      nodeNames,
      compiler,
      formatter,
      buildTree,
      readFile
    );

    const parseEndTime = Date.now();
    program.metadata ??= {};
    program.metadata.parseDuration = parseEndTime - parseStartTime;

    // console.warn(program);
    return program;
  }
}
