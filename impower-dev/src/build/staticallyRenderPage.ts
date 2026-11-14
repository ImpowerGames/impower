import populateDocument from "./populateDocument.js";

const staticallyRenderPage = (
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
): string => {
  const { html, css, js, mjs, cssPath, jsPath, mjsPath } = page;
  return populateDocument(documentHtml, {
    html: html || "",
    css,
    js,
    mjs,
    cssPath,
    jsPath,
    mjsPath,
  });
};

export default staticallyRenderPage;
