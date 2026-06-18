import { setLanguageServer as setScriptEditorLanguageServer } from "@impower/sparkdown-document-views/src/modules/script-editor/SparkdownScriptEditor";
import SparkEditor from "../modules/spark-editor/index";
import { Workspace } from "../modules/spark-editor/workspace/Workspace";

const load = async () => {
  // Wire the LSP worker/connection before any SparkdownScriptEditor
  // instance mounts (Controller reads these at construction time).
  setScriptEditorLanguageServer({
    worker: Workspace.ls.worker,
    connection: Workspace.ls.connection,
  });
  await SparkEditor.init();
  // Reveal the page now that web components are registered. The
  // `<style id="ssg-css">` block stays in <head> permanently — it
  // carries the spec-component normalize (scrollbar styling, base
  // resets), impower-ui Tailwind, and the unlayered overrides. Removing
  // it (the legacy did, on the assumption sparkle's adoptAll had
  // replaced it) leaves the page unstyled now that sparkle is gone.
  window.requestAnimationFrame(() => {
    document.documentElement.style["opacity"] = "1";
  });
};

load();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(
    (registration) => {
      console.log("Service worker registration successful:", registration);
    },
    (error) => {
      console.error(`Service worker registration failed: ${error}`);
    },
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
