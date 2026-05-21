import baseNormalize from "../../../../packages/spec-component/src/styles/normalize/normalize.css";
import editorNormalize from "./styles/normalize/normalize.css";
import editorTheme from "./styles/theme/theme.css";

const components = [
  { tag: "", css: baseNormalize },
  { tag: "", css: editorNormalize },
  { tag: "", css: editorTheme },
] as const;

export default components;
