import SparkEditor from "@impower/spark-editor/src/index.js";
import SparkdownScriptEditor from "@impower/sparkdown-script-views/src/modules/editor/index.js";
import SparkdownScriptPreview from "@impower/sparkdown-script-views/src/modules/preview/index.js";
import Sparkle from "@impower/sparkle/src/index.js";

const load = async () => {
  await Promise.allSettled([
    Sparkle.init(),
    SparkdownScriptEditor.init(),
    SparkdownScriptPreview.init(),
    SparkEditor.init(),
  ]);
  document.body.classList.add("ready");
};
load();
