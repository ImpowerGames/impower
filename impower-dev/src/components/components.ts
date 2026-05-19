import sparkdownScriptEditorComponents from "@impower/sparkdown-document-views/src/modules/script-editor/components.js";
import sparkleComponents from "@impower/sparkle/src/components.js";
import sparkEditorComponents from "../modules/spark-editor/components";

// screenplay-preview is no longer in this list — it's a preact-custom-element
// big-block registered explicitly via `SparkdownScreenplayPreviewElement.register()`
// from inside SparkEditor.init(), not via spec-component's defineAll.
export default [
  ...sparkleComponents,
  ...sparkdownScriptEditorComponents,
  ...sparkEditorComponents,
];
