import { editorShortcutDispatch } from "@impower/codemirror-vscode-lsp-client/src/shortcutDispatch";
import { useEffect } from "preact/hooks";
import workspaceShortcuts from "../../workspace/shortcuts/WorkspaceShortcuts";
import workspace from "../../workspace/WorkspaceStore";
import { withSearch } from "./withSearch";

const leftTheField = (event: KeyboardEvent) =>
  event.target === document.body ||
  event
    .composedPath()
    .some(
      (target) =>
        target instanceof Element &&
        target.classList.contains("sparkdown-script-editor-root"),
    );

export default function useFindShortcut() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        workspace.search.peek().open &&
        leftTheField(event)
      ) {
        event.preventDefault();
        withSearch((search) => search.close());
        return;
      }
      if (editorShortcutDispatch(event)) {
        return;
      }
      const backward = workspaceShortcuts.matches(event, "findPrevious");
      if (backward || workspaceShortcuts.matches(event, "findNext")) {
        event.preventDefault();
        withSearch((search) => search.stepOrOpen(backward));
      } else if (workspaceShortcuts.matches(event, "search")) {
        event.preventDefault();
        withSearch((search) => search.openFindFromSelection());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
