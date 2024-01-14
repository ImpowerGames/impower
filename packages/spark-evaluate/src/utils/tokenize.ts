import DEFAULT_PARSER from "../constants/DEFAULT_PARSER";

const tokenize = (
  expr: string
): {
  type: string;
  content: string;
  from: number;
  to: number;
}[] => {
  try {
    const [, ctx] = DEFAULT_PARSER.parse(expr);
    return ctx.tokens;
  } catch {
    // NoOp
  }
  return [];
};

export default tokenize;
