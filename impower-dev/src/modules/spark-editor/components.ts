import normalize from "./styles/normalize/normalize.css?raw";
import editorTheme from "./styles/theme/theme.css?raw";

const components = [
  { tag: "", css: normalize },
  { tag: "", css: editorTheme },
] as const;

export default components;
