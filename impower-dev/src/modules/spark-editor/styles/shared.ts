import baseNormalize from "../../../../../packages/spec-component/src/styles/normalize/normalize.css";
import editorNormalize from "../styles/normalize/normalize.css";
// `?inline` returns the compiled Tailwind output as a string (rather than
// Vite's default JS wrapper that injects a <style> tag at runtime). This
// makes Tailwind available to every spec-component as a constructable
// stylesheet — adopted into shadow roots synchronously when the component
// upgrades, so Preact-rendered content (which lives inside spark-editor's
// shadow root) is styled on its very first paint instead of flashing
// unstyled until MainWindow's useLayoutEffect copies Tailwind in.
import impowerUiTailwind from "@impower/impower-ui/style.css?inline";

export default { baseNormalize, editorNormalize, impowerUiTailwind };
