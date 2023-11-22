import {
  ESNextStaticEval,
  INode,
  KeyedObject,
} from "../_modules/ESpression/src";
import { DEFAULT_COMPILER_CONFIG } from "../constants/DEFAULT_COMPILER_CONFIG";

export class SparkExpressionCompiler extends ESNextStaticEval {
  constructor(public config = DEFAULT_COMPILER_CONFIG) {
    super();
  }

  protected CustomTemplateExpression(
    node: INode,
    context: KeyedObject
  ): unknown {
    const [result, diagnostics] =
      this.config.formatter?.(`{${node.raw}}`, context) || [];
    // diagnostics should all be offset by -1 since we are surrounding the expression with {} before feeding into formatter
    const offset = -1;
    if (diagnostics) {
      const from = node.from ?? 0;
      diagnostics.forEach((d) => {
        this.diagnostics.push({
          content: d.content,
          from: from + d.from + offset,
          to: from + d.to + offset,
          severity: d.severity || "error",
          message: d.message || "",
        });
      });
    }
    return result;
  }
}
