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
  // Reload to pick up a NEW worker version (so the PWA auto-updates to the latest
  // engine code without the user clicking "update") — but ONLY in PRODUCTION, and
  // only when this page was already controlled by a previous worker (a genuine
  // update). Two reasons to skip this in dev:
  //   1. The dev SW only intercepts /file:/ OPFS (sw.ts gates everything else on
  //      production), so there is never a dev "update" worth reloading for.
  //   2. Reloading on controllerchange in dev spins into an endless loop whenever
  //      a second worker keeps claiming the origin — e.g. the same-origin preview
  //      iframe mistakenly registering a competing /sw.js (fixed in the player's
  //      main.ts; this gate is the belt-and-suspenders).
  // On an UNCONTROLLED load the controller goes null→worker (the initial claim);
  // reloading on THAT also loops (the reload fires before the new worker persists
  // as the saved controller), so we additionally require an existing controller.
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
