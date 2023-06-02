import SparkEditor from "@impower/spark-editor/src/index.js";
import Sparkle from "@impower/sparkle/src/index.js";

const initialize = async () => {
  try {
    await Sparkle.init();
    await SparkEditor.init();
  } catch (err: any) {
    console.log(err.stack);
  }
};
initialize();
