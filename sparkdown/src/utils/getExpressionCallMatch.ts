const methodRegex = /^([ ]*)([a-zA-Z]+[\w]*)([ ]*)([(][^\n\r]*[)])?([ ]*)$/;
const functionRegex = /^([ ]*)([a-zA-Z]+[\w]*)([ ]*)([(][^\n\r]*[)])([ ]*)$/;

export const getExpressionCallMatch = (
  type: "method" | "function",
  expression: string
): RegExpMatchArray | null => {
  const match =
    type === "method"
      ? expression.match(methodRegex)
      : expression.match(functionRegex);
  return match;
};
