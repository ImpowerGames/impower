import { DEFAULT_COMPILER_CONFIG } from "../constants/DEFAULT_COMPILER_CONFIG";
import { Formatter } from "../types/Formatter";
import {
  ESNextStaticEval,
  INode,
  KeyedObject,
} from "../_modules/ESpression/src";

export class SparkExpressionCompiler extends ESNextStaticEval {
  config: {
    formatter?: Formatter;
  } = DEFAULT_COMPILER_CONFIG;

  constructor(config: { formatter?: Formatter }) {
    super();
    this.config = config;
  }

  protected TemplateArgsExpression(node: INode, context: KeyedObject): unknown {
    const [result] =
      this.config.formatter?.(`{${node.content}}`, context) || [];
    return result;
  }
}
