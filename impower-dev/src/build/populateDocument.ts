import indent from "./indent.js";

const populateDocument = (
  documentHtml: string,
  page?: {
    html?: string;
    css?: string;
    js?: string;
    mjs?: string;
    cssPath?: string;
    jsPath?: string;
    mjsPath?: string;
  }
) => {
  let result = documentHtml || "";
  const css = page?.css ? indent(page?.css.trim(), 4) : "";
  const html = page?.html ? indent(page?.html.trim(), 4) : "";
  const js = page?.js ? page?.js.trim() : "";
  const mjs = page?.mjs ? page?.mjs.trim() : "";
  const cssPath = page?.cssPath;
  const jsPath = page?.jsPath;
  const mjsPath = page?.mjsPath;
  if (css) {
    result = result.replace("<style></style>", `<style>\n${css}\n  </style>`);
  }
  if (html) {
    result = result.replace("<main></main>", `<main>\n${html}\n  </main>`);
  }
  if (js) {
    result = result.replace("<script></script>", `<script>\n${js}\n</script>`);
  }
  if (mjs) {
    result = result.replace(
      "<script></script>",
      `<script type="module">\n${mjs}\n</script>`
    );
  }
  if (cssPath) {
    result = result.replace(
      "<style></style>",
      `<link rel="stylesheet" type="text/css" href="${cssPath}">`
    );
  }
  if (jsPath) {
    result = result.replace(
      "<script></script>",
      `<script src="${jsPath}"></script>`
    );
  }
  if (mjsPath) {
    result = result.replace(
      "<script></script>",
      `<script type="module" src="${mjsPath}"></script>`
    );
  }
  return result;
};

export default populateDocument;
