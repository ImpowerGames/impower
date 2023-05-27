const generateSSRContent = (
  data: {
    html?: string;
    css?: string;
  },
  transforms?: {
    html?: (data: { html: string; css: string }) => string;
    css?: (data: { html: string; css: string }) => string;
  }
): string => {
  const html = data?.html?.trim() || "";
  const css = data?.css?.trim() || "";
  const transformedHtml = transforms?.html?.({ html, css })?.trim() ?? html;
  const transformedCss = transforms?.css?.({ html, css })?.trim() ?? css;
  const styleAttr = transformedHtml ? "" : ` scope="global"`;
  const cssChunk = transformedCss
    ? `<style${styleAttr}>\n${transformedCss}\n</style>`
    : "";
  const htmlChunk = transformedHtml ? `${transformedHtml}` : "";
  return [cssChunk, htmlChunk].join("\n");
};

export default generateSSRContent;
