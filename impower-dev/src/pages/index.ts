import SparkEditor from "@impower/spark-editor/src/index.js";
import SparkScreenplayPreview from "@impower/spark-screenplay-preview/src/index.js";
import SparkdownScriptEditor from "@impower/sparkdown-script-editor/src/index.js";
import Sparkle from "@impower/sparkle/src/index.js";

const load = async () => {
  await Promise.allSettled([
    Sparkle.init(),
    SparkdownScriptEditor.init(),
    SparkScreenplayPreview.init(),
    SparkEditor.init(),
  ]);
  document.body.classList.add("ready");
};
load();
