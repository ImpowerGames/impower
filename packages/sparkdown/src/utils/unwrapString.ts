import PRIMITIVE_TYPE_REGEX from "../constants/PRIMITIVE_TYPE_REGEX";

const unwrapString = (content: string): string => {
  const match = content.match(PRIMITIVE_TYPE_REGEX.string);
  if (match) {
    return match[2] || "";
  }
  return content;
};

export default unwrapString;
