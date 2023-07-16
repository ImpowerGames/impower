import sparkElementComponents from "@impower/spark-element/src/components.js";
import sparkdownScriptEditorComponents from "@impower/sparkdown-script-views/src/modules/editor/components.js";
import sparkdownScriptPreviewComponents from "@impower/sparkdown-script-views/src/modules/preview/components.js";
import sparkleComponents from "@impower/sparkle/src/components.js";
import sparkEditorComponents from "../modules/spark-editor/components";

export default {
  ...sparkElementComponents,
  ...sparkleComponents,
  ...sparkdownScriptEditorComponents,
  ...sparkdownScriptPreviewComponents,
  ...sparkEditorComponents,
};
