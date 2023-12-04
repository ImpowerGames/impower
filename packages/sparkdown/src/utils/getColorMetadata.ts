import SPARK_PRIMITIVE_TYPE_REGEX from "../constants/SPARK_PRIMITIVE_TYPE_REGEX";
import { SparkColorMetadata } from "../types/SparkColorMetadata";
import { SparkRange } from "../types/SparkRange";

const getColorMetadata = (
  expression: string,
  expressionRange: SparkRange | undefined
): SparkColorMetadata | null => {
  if (expression && expressionRange && expressionRange.from >= 0) {
    const expressionTo = (expressionRange.from ?? 0) + expression.length;
    const trimmedStartWhitespaceLength =
      expression.length - expression.trimStart().length;
    const trimmedEndWhitespaceLength =
      expression.length - expression.trimEnd().length;
    const trimmedExpression = expression.trim();
    const stringMatch = trimmedExpression.match(
      SPARK_PRIMITIVE_TYPE_REGEX.string
    );
    if (!stringMatch) {
      return null;
    }
    const stringContent = stringMatch[2] || "";
    const from = (expressionRange.from ?? 0) + trimmedStartWhitespaceLength + 1;
    const to = expressionTo - trimmedEndWhitespaceLength - 1;
    if (
      SPARK_PRIMITIVE_TYPE_REGEX.hex_color.test(stringContent) ||
      SPARK_PRIMITIVE_TYPE_REGEX.hsl_color.test(stringContent) ||
      SPARK_PRIMITIVE_TYPE_REGEX.rgb_color.test(stringContent)
    ) {
      return {
        line: expressionRange.line,
        from,
        to,
        value: stringContent,
      };
    }
  }
  return null;
};

export default getColorMetadata;
