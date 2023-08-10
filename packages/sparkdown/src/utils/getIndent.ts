import SPARK_REGEX from "../constants/SPARK_REGEX";

const getIndent = (content: string) => {
  const indentMatch = content.match(SPARK_REGEX.indent);
  return indentMatch?.[0] || "";
};

export default getIndent;
