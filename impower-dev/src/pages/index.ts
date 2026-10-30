import { setLanguageServer as setScriptEditorLanguageServer } from "@impower/sparkdown-document-views/src/modules/script-editor/SparkdownScriptEditor";
import SparkEditor from "../modules/spark-editor/index";
import { downloadProjectZip } from "../modules/spark-editor/utils/downloadProjectZip";
import { warnIfStorageNotPersisted } from "../modules/spark-editor/utils/storagePersistence";
import { Workspace } from "../modules/spark-editor/workspace/Workspace";

const load = async () => {
  setScriptEditorLanguageServer({
    worker: Workspace.ls.worker,
    connection: Workspace.ls.connection,
  });
  await SparkEditor.init();
  window.requestAnimationFrame(() => {
    document.documentElement.style["opacity"] = "1";
  });
};

load();

let devAssetMirrorStarted = false;
const startDevAssetMirror = () => {
  if (!import.meta.env.DEV || devAssetMirrorStarted) {
    return;
  }
  if (new URLSearchParams(location.search).get("nomirror") === "1") {
    console.warn("[dev-asset-mirror] disabled via ?nomirror=1");
    return;
  }
  devAssetMirrorStarted = true;
  import("./devAssetMirror").then(({ syncOpfsToDevAssetMirror }) => {
    syncOpfsToDevAssetMirror();
    setInterval(() => syncOpfsToDevAssetMirror(), 20_000);
  });
};

void warnIfStorageNotPersisted({
  storage: navigator.storage,
  projectId: Workspace.window.store.project.id,
  exportProject: downloadProjectZip,
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(
    (registration) => {
      console.log("Service worker registration successful:", registration);
    },
    (error) => {
      console.error(`Service worker registration failed: ${error}`);
      startDevAssetMirror();
    },
  );
  if (import.meta.env.DEV) {
    Promise.race([
      navigator.serviceWorker.ready.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 20_000)),
    ]).then((workerIsLive) => {
      if (!workerIsLive) {
        console.warn(
          "Service worker never activated — falling back to the dev asset mirror.",
        );
        startDevAssetMirror();
      }
    });
  }
  if (import.meta.env.PROD && navigator.serviceWorker.controller) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) {
        return;
      }
      refreshing = true;
      window.location.reload();
    });
  }
} else {
  console.error("Service workers are not supported.");
}
