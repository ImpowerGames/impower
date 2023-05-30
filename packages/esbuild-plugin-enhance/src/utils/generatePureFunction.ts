import { convertToPascalCase } from "./convertToPascalCase.js";
import generateSSRContent from "./generateSSRContent.js";

const generatePureFunction = (
  tagName: string,
  data: {
    html?: string;
    css?: string;
  },
  transforms?: {
    html?: (data: { html: string; css: string }) => string;
    css?: (data: { html: string; css: string }) => string;
  }
): string => {
  const componentName = convertToPascalCase(tagName);
  const content = generateSSRContent(data, transforms);
  return `export default function ${componentName}({ html }) {\nreturn html\`\n${content}\n\`;\n}`.trim();
};

export default generatePureFunction;
