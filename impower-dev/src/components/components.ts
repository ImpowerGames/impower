import sparkEditorComponents from "@impower/spark-editor/src/components.js";
import sparkElementComponents from "@impower/spark-element/src/components.js";
import sparkScreenplayPreviewComponents from "@impower/spark-screenplay-preview/src/components.js";
import sparkdownScriptEditorComponents from "@impower/sparkdown-script-editor/src/components.js";
import sparkleComponents from "@impower/sparkle/src/components.js";

export default {
  ...sparkElementComponents,
  ...sparkleComponents,
  ...sparkdownScriptEditorComponents,
  ...sparkScreenplayPreviewComponents,
  ...sparkEditorComponents,
};
