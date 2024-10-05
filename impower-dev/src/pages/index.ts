import SparkWebPlayer from "@impower/spark-web-player/src/index.js";
import SparkdownScreenplayPreview from "@impower/sparkdown-document-views/src/modules/screenplay-preview/index.js";
import SparkdownScriptEditor from "@impower/sparkdown-document-views/src/modules/script-editor/index.js";
import Sparkle from "@impower/sparkle/src/index.js";
import extractAllSVGs from "../build/extractAllSVGs";
import SparkEditor from "../modules/spark-editor/index";
import icons from "../modules/spark-editor/styles/icons/icons.css";
import { Workspace } from "../modules/spark-editor/workspace/Workspace";

const load = async () => {
  const languageServerConnection = await Workspace.ls.getConnection();
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
  // Once all web components (and their constructable stylesheets) are loaded,
  // the statically-generated stylesheet is no longer needed
  const ssgStyleSheetElement = document.querySelector('link[href="/ssg.css"]');
  if (ssgStyleSheetElement) {
    window.requestAnimationFrame(() => {
      document.documentElement.style["opacity"] = "1";
      ssgStyleSheetElement.remove();
    });
  }
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
  // TODO: Handle service worker refresh with Approach #4 instead of Approach #2:
  // https://redfin.engineering/how-to-fix-the-refresh-button-when-using-service-workers-a8e27af6df68
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    window.location.reload();
  });
} else {
  console.error("Service workers are not supported.");
}
