import {
  Compiler,
  Tree,
  printTree,
} from "../../../grammar-compiler/src/compiler";
import { NodeID } from "../../../grammar-compiler/src/core";
import {
  Grammar,
  GrammarState,
  Matched,
  NodeName,
} from "../../../grammar-compiler/src/grammar";
import GRAMMAR_DEFINITION from "../../language/sparkdown.language-grammar.json";
import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkProgram } from "../types/SparkProgram";

type SparkdownRule = keyof typeof GRAMMAR_DEFINITION.repository;

interface TraversalOptions {
  onEnter?: (match: Matched, state: GrammarState) => void;
  onLeave?: (match: Matched, state: GrammarState) => void;
}

class Node {
  id: string;
  from: number;
  to: number;
  scopes: string[];
  parent: Node | undefined;
  children: Node[] = [];

  constructor(
    id: string,
    from: number,
    to: number,
    scopes: string[],
    parent: Node | undefined
  ) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.scopes = scopes;
    this.parent = parent;
  }

  push(child: Node) {
    this.children.push(child);
  }

  read(text: string) {
    return text.slice(this.from, this.to);
  }
}

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
    if (script) {
      const result = this.compiler.compile(script);
      const nodeNames = this.grammar.nodeNames as NodeName<SparkdownRule>[];
      const scopes = new Set<NodeName<SparkdownRule>>();
      if (result) {
        const topID = NodeID.top;
        const buffer = result.cursor;
        const reused = result.reused;
        const tree = Tree.build({
          topID,
          buffer,
          reused,
        });
        const obj = new Node(
          "top",
          0,
          script.length - 1,
          Array.from(scopes),
          undefined
        );
        let parent: Node | undefined = obj;
        tree.iterate({
          enter: (node) => {
            const id = nodeNames[node.type]!;
            const child = new Node(
              id,
              node.from,
              node.to,
              Array.from(scopes),
              parent
            );
            parent?.children.push(child);
            parent = child;
            scopes.add(id);
          },
          leave: (node) => {
            const id = nodeNames[node.type]!;
            parent = parent?.parent;
            scopes.delete(id);
          },
        });
        console.log(obj);
        console.log(printTree(tree, script, nodeNames));
      }
    }
    const program: SparkProgram = {
      tokens: [],
      diagnostics: [],
      metadata: {},
    };
    return program;
  }
}
