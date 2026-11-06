import { useEffect } from "preact/hooks";
import { canRedo, canUndo, redo, undo } from "../../utils/undoManager";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import workspaceShortcuts from "../../workspace/shortcuts/WorkspaceShortcuts";
import workspace from "../../workspace/WorkspaceStore";

function isEditableFocus(): boolean {
  let el: Element | null = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  if (!el) {
    return false;
  }
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    return true;
  }
  if ((el as HTMLElement).isContentEditable) {
    return true;
  }
  return !!el.closest?.(".cm-editor");
}

export function useWorkspaceSession(): void {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { Workspace } = await import("../../workspace/Workspace");
      try {
        const info = await Workspace.sync.google.getCurrentAccount();
        if (!cancelled) {
          Workspace.window.setAccount(info);
        }
      } catch (err) {
        console.error(err);
      }
      try {
        await Workspace.window.loadProject();
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (workspaceShortcuts.matches(e, "format")) {
        e.preventDefault();
        const { Workspace } = await import("../../workspace/Workspace");
        await Workspace.window.syncProject();
        return;
      }
      if (workspaceShortcuts.matches(e, "playFromHere")) {
        const game = workspace.state.peek().preview?.modes?.game;
        e.preventDefault();
        if (workspaceSettings.preferences.peek().previewMode !== "game" || game?.loading) {
          return;
        }
        const { Workspace } = await import("../../workspace/Workspace");
        Workspace.window.toggleGameRunning();
        return;
      }
      const isUndo = workspaceShortcuts.matches(e, "undo");
      const isRedo = !isUndo && workspaceShortcuts.matches(e, "redo");
      if (isUndo || isRedo) {
        if (isEditableFocus()) {
          return;
        }
        if (isRedo ? !canRedo.value : !canUndo.value) {
          return;
        }
        e.preventDefault();
        if (isRedo) {
          await redo();
        } else {
          await undo();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
