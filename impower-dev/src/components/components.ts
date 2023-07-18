import sparkdownScriptEditorComponents from "@impower/sparkdown-script-views/src/modules/editor/components.js";
import sparkdownScriptPreviewComponents from "@impower/sparkdown-script-views/src/modules/preview/components.js";
import sparkleComponents from "@impower/sparkle/src/components.js";
import sparkElementComponents from "../../../packages/spark-element/src/components";
import sparkEditorComponents from "../modules/spark-editor/components";

export default {
  ...sparkElementComponents,
  ...sparkleComponents,
  ...sparkdownScriptEditorComponents,
  ...sparkdownScriptPreviewComponents,
  ...sparkEditorComponents,
};
