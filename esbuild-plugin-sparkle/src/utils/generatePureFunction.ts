import Graphic from "sparkle-style-transformer/types/graphic.js";
import generateSSRContent from "./generateSSRContent.js";

const REGEX_PASCAL = /[-_](\w\w$|\w)/g;

const convertToPascalCase = (s: string): string => {
  if (!s) {
    return s;
  }
  return (
    (s[0]?.toUpperCase() || "") +
    s.slice(1).replace(REGEX_PASCAL, (_, letter) => letter.toUpperCase())
  );
};

const generatePureFunction = (
  tagName: string,
  data: {
    html?: string;
    css?: string;
    scriptSrc?: string;
    patterns?: Record<string, Graphic>;
    icons?: Record<string, Graphic>;
  }
): string => {
  const componentName = convertToPascalCase(tagName);
  const content = generateSSRContent(data);
  return `export default function ${componentName}({ html }) {\nreturn html\`\n${content}\n\`;\n}`.trim();
};

export default generatePureFunction;
