const METHOD_REGEX = /^([ ]*)([a-zA-Z]+[\w]*)([ ]*)([(][^\n\r]*[)])?([ ]*)$/;
const FUNCTION_REGEX = /^([ ]*)([a-zA-Z]+[\w]*)([ ]*)([(][^\n\r]*[)])([ ]*)$/;

const getExpressionCallMatch = (
  type: "method" | "function",
  expression: string
): RegExpMatchArray | null => {
  const match =
    type === "method"
      ? expression.match(METHOD_REGEX)
      : expression.match(FUNCTION_REGEX);
  return match;
};

export default getExpressionCallMatch;
