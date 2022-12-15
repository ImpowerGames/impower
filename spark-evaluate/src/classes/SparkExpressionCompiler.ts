import { DEFAULT_COMPILER_CONFIG } from "../constants/DEFAULT_COMPILER_CONFIG";
import { CompilerConfig } from "../types/CompilerConfig";
import {
  ESNextStaticEval,
  INode,
  KeyedObject,
} from "../_modules/ESpression/src";

export class SparkExpressionCompiler extends ESNextStaticEval {
  config: CompilerConfig = DEFAULT_COMPILER_CONFIG;

  constructor(config: CompilerConfig) {
    super();
    this.config = config;
  }

  protected TemplateArgsExpression(node: INode, context: KeyedObject): unknown {
    const [result] =
      this.config.formatter?.(`{${node.content}}`, context) || [];
    return result;
  }
}
