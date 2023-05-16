import { Graphic } from "../types/graphic";
import { convertToPascalCase } from "./convertToPascalCase";
import { generateSSRContent } from "./generateSSRContent";

export const generatePureFunction = (
  tagName: string,
  data: {
    html?: string;
    css?: string;
    js?: string;
    graphics?: Record<string, Graphic>;
  }
): string => {
  const componentName = convertToPascalCase(tagName);
  const content = generateSSRContent(data, tagName === "core");
  return `export default function ${componentName}({ html }) {\nreturn html\`\n${content}\n\`;\n}`.trim();
};
