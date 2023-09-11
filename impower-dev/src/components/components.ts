import sparkWebPlayerComponents from "@impower/spark-web-player/src/components.js";
import sparkdownScriptPreviewComponents from "@impower/sparkdown-document-views/src/modules/screenplay-preview/components.js";
import sparkdownScriptEditorComponents from "@impower/sparkdown-document-views/src/modules/script-editor/components.js";
import sparkleComponents from "@impower/sparkle/src/components.js";
import sparkEditorComponents from "../modules/spark-editor/components";

export default [
  ...sparkleComponents,
  ...sparkWebPlayerComponents,
  ...sparkdownScriptEditorComponents,
  ...sparkdownScriptPreviewComponents,
  ...sparkEditorComponents,
];
