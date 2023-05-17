import { Graphic } from "../types/graphic";
import { getStyledHtml } from "./getStyledHtml";

export const generateSSRContent = (
  data: {
    html?: string;
    css?: string;
    js?: string;
    patterns?: Record<string, Graphic>;
    icons?: Record<string, Graphic>;
  },
  core?: boolean
): string => {
  const html = data?.html?.trim() || "";
  const css = data?.css?.trim() || "";
  const js = data?.js?.trim() || "";
  const patterns = data?.patterns;
  const icons = data?.icons;
  const styledHtml = getStyledHtml(html, { patterns, icons });
  const transformedCss = core
    ? css.replace(/:host[(]/g, "").replace(/][)]/g, "]")
    : css;
  const styleAttr = html ? "" : `scope="global"`;
  const cssChunk = transformedCss
    ? `\n<style ${styleAttr}>\n${transformedCss}\n</style>`
    : "";
  const htmlChunk = `\n${styledHtml}`;
  const jsChunk = js ? `\n<script>\n${js}\n</script>` : "";
  return `${cssChunk}${htmlChunk}${jsChunk}`.trim();
};
