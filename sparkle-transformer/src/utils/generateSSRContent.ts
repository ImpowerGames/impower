import { Graphic } from "../types/graphic";
import { getStyledHtml } from "./getStyledHtml";

export const generateSSRContent = (
  data: {
    html?: string;
    css?: string;
    js?: string;
    graphics?: Record<string, Graphic>;
  },
  core?: boolean
): string => {
  const html = data?.html?.trim() || "";
  const css = data?.css?.trim() || "";
  const js = data?.js?.trim() || "";
  const graphics = data?.graphics;
  const styledHtml = getStyledHtml(html, { graphics });
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
