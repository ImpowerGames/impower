import sparkEditorComponents from "@impower/spark-editor/src/components.js";
import sparkElementComponents from "@impower/spark-element/src/components.js";
import sparkdownScriptEditorComponents from "@impower/sparkdown-script-view/src/modules/editor/components.js";
import sparkdownScriptPreviewComponents from "@impower/sparkdown-script-view/src/modules/preview/components.js";
import sparkleComponents from "@impower/sparkle/src/components.js";

export default {
  ...sparkElementComponents,
  ...sparkleComponents,
  ...sparkdownScriptEditorComponents,
  ...sparkdownScriptPreviewComponents,
  ...sparkEditorComponents,
};
