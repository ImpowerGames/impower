import SPARK_PRIMITIVE_TYPE_REGEX from "../constants/SPARK_PRIMITIVE_TYPE_REGEX";
import { SparkColorMetadata } from "../types/SparkColorMetadata";

const getColorMetadata = (
  expression: string,
  expressionFrom: number = -1
): SparkColorMetadata | null => {
  if (expressionFrom >= 0) {
    const expressionTo = expressionFrom + expression.length;
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
    const from = expressionFrom + trimmedStartWhitespaceLength + 1;
    const to = expressionTo - trimmedEndWhitespaceLength - 1;
    if (
      SPARK_PRIMITIVE_TYPE_REGEX.hex_color.test(stringContent) ||
      SPARK_PRIMITIVE_TYPE_REGEX.hsl_color.test(stringContent) ||
      SPARK_PRIMITIVE_TYPE_REGEX.rgb_color.test(stringContent)
    ) {
      return {
        from,
        to,
        value: stringContent,
      };
    }
  }
  return null;
};

export default getColorMetadata;
