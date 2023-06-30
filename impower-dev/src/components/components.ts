import sparkEditorComponents from "@impower/spark-editor/src/components.js";
import sparkElementComponents from "@impower/spark-element/src/components.js";
import sparkdownEditorComponents from "@impower/sparkdown-script-editor/src/components.js";
import sparkleComponents from "@impower/sparkle/src/components.js";

export default {
  ...sparkElementComponents,
  ...sparkleComponents,
  ...sparkdownEditorComponents,
  ...sparkEditorComponents,
};
