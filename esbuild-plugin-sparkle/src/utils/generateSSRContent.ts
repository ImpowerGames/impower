import Graphic from "sparkle-style-transformer/types/graphic.js";
import generateStyledHtml from "sparkle-style-transformer/utils/generateStyledHtml.js";

const generateSSRContent = (data: {
  html?: string;
  css?: string;
  scriptSrc?: string;
  patterns?: Record<string, Graphic>;
  icons?: Record<string, Graphic>;
}): string => {
  const html = data?.html?.trim() || "";
  const css = data?.css?.trim() || "";
  const scriptSrc = data?.scriptSrc?.trim() || "";
  const patterns = data?.patterns;
  const icons = data?.icons;
  const styledHtml = generateStyledHtml(html, { patterns, icons });
  const styleAttr = html ? "" : `scope="global"`;
  const cssChunk = css ? `\n<style ${styleAttr}>\n${css}\n</style>` : "";
  const htmlChunk = `\n${styledHtml}`;
  const jsChunk = scriptSrc
    ? `\n<script type="module" src="${scriptSrc}">`
    : "";
  return `${cssChunk}${htmlChunk}${jsChunk}`.trim();
};

export default generateSSRContent;
