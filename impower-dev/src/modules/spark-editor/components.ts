import normalize from "./styles/normalize/normalize.css";
import editorTheme from "./styles/theme/theme.css";

const components = [
  { tag: "", css: normalize },
  { tag: "", css: editorTheme },
] as const;

export default components;
