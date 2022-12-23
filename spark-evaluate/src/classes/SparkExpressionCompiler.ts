import { DEFAULT_COMPILER_CONFIG } from "../constants/DEFAULT_COMPILER_CONFIG";
import {
  ESNextStaticEval,
  INode,
  KeyedObject,
} from "../_modules/ESpression/src";

export class SparkExpressionCompiler extends ESNextStaticEval {
  constructor(public config = DEFAULT_COMPILER_CONFIG) {
    super();
  }

  protected TemplateArgsExpression(node: INode, context: KeyedObject): unknown {
    const [result] =
      this.config.formatter?.(`{${node.content}}`, context) || [];
    return result;
  }
}
