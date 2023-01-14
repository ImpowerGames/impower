import { sparkRegexes } from "../constants/sparkRegexes";

export const getIndent = (content: string) => {
  const indentMatch = content.match(sparkRegexes.indent);
  return indentMatch?.[0] || "";
};
