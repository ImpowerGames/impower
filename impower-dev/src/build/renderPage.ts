import { ComponentSpec } from "./ComponentSpec";
import expandHtml from "./expandHtml.js";
import populateDocument from "./populateDocument.js";

const renderPage = (
  documentHtml: string,
  page: {
    css?: string;
    html?: string;
    js?: string;
    mjs?: string;
    cssPath?: string;
    jsPath?: string;
    mjsPath?: string;
  },
  components: Record<string, ComponentSpec>
): string => {
  const { html, css, js, mjs, cssPath, jsPath, mjsPath } = page;
  const expandedHtml = expandHtml(html || "", components);
  return populateDocument(documentHtml, {
    html: expandedHtml,
    css,
    js,
    mjs,
    cssPath,
    jsPath,
    mjsPath,
  });
};

export default renderPage;
