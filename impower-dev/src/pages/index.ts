import SparkWebPlayer from "@impower/spark-web-player/src/index.js";
import SparkdownScreenplayPreview from "@impower/sparkdown-document-views/src/modules/screenplay-preview/index.js";
import SparkdownScriptEditor from "@impower/sparkdown-document-views/src/modules/script-editor/index.js";
import Sparkle from "@impower/sparkle/src/index.js";
import extractAllSVGs from "../build/extractAllSVGs";
import SparkEditor from "../modules/spark-editor/index";
import icons from "../modules/spark-editor/styles/icons/icons.css";
import { Workspace } from "../modules/spark-editor/workspace/Workspace";

const load = async () => {
  const languageServerConnection = await Workspace.lsp.getConnection();
  const graphics: Record<string, string> = {};
  const svgs = extractAllSVGs("--s-icon-", icons);
  Object.entries(svgs).forEach(([name, svg]) => {
    graphics[name] = svg;
  });
  await Promise.allSettled([
    Sparkle.init({ graphics }),
    SparkWebPlayer.init({ graphics }),
    SparkdownScriptEditor.init({
      languageServerConnection,
      fileSystemReader: {
        scheme: Workspace.fs.scheme,
        url: async (uri: string) => Workspace.fs.getUrl(uri),
      },
      graphics,
    }),
    SparkdownScreenplayPreview.init({ graphics }),
    SparkEditor.init({ graphics }),
  ]);
  document.body.classList.add("ready");
};

load();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(
    (registration) => {
      console.log("Service worker registration successful:", registration);
    },
    (error) => {
      console.error(`Service worker registration failed: ${error}`);
    }
  );
} else {
  console.error("Service workers are not supported.");
}
