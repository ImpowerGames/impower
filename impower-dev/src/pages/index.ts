import SparkWebPlayer from "@impower/spark-web-player/src/index.js";
import SparkdownScreenplayPreview from "@impower/sparkdown-document-views/src/modules/screenplay-preview/index.js";
import SparkdownScriptEditor from "@impower/sparkdown-document-views/src/modules/script-editor/index.js";
import Sparkle from "@impower/sparkle/src/index.js";
import SparkEditor from "../modules/spark-editor/index";
import { Workspace } from "../modules/spark-editor/workspace/Workspace";

const load = async () => {
  await Promise.allSettled([
    Sparkle.init(),
    SparkWebPlayer.init(),
    SparkdownScriptEditor.init({
      languageServerConnection: Workspace.lsp.connection,
      fileSystemReader: {
        scheme: Workspace.fs.scheme,
        url: async (uri: string) => Workspace.fs.getUrl(uri),
      },
    }),
    SparkdownScreenplayPreview.init(),
    SparkEditor.init(),
  ]);
  document.body.classList.add("ready");
  Workspace.window.loadProjectName(Workspace.project.id);
};

load();
