import indent from "./indent.js";

const transformDocument = (
  documentHtml: string,
  mainCss: string,
  mainHtml: string,
  mainJs: string
) => {
  const css = mainCss ? indent(mainCss.trim(), 4) : "";
  const html = mainHtml ? indent(mainHtml.trim(), 4) : "";
  const js = mainJs ? mainJs.trim() : "";
  let transformedStr = documentHtml;
  if (css) {
    transformedStr = transformedStr.replace("</style>", `\n${css}\n  </style>`);
  }
  if (html) {
    transformedStr = transformedStr.replace("</main>", `\n${html}\n  </main>`);
  }
  if (js) {
    transformedStr = transformedStr
      .replace("<script>", `<script type="module">`)
      .replace("</script>", `\n${js}\n  </script>`);
  }
  return transformedStr;
};

export default transformDocument;
