import { useEffect } from "preact/hooks";
import { isEditableFocus } from "../../utils/focusedElement";
import { canRedo, canUndo, redo, undo } from "../../utils/undoManager";
import workspaceSettings from "../../workspace/settings/WorkspaceSettings";
import workspaceShortcuts from "../../workspace/shortcuts/WorkspaceShortcuts";
import { STEP_SHORTCUTS, STEP_TRAVERSALS } from "../../workspace/stepStates";
import workspace from "../../workspace/WorkspaceStore";

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
      if (!cancelled) {
        await Workspace.window.reviewDeviceStorage();
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
      const traversal = STEP_TRAVERSALS.find((step) =>
        workspaceShortcuts.matches(e, STEP_SHORTCUTS[step]),
      );
      if (traversal) {
        if (workspace.state.peek().preview?.modes?.game?.running) {
          e.preventDefault();
          const { Workspace } = await import("../../workspace/Workspace");
          void Workspace.window.stepGame(traversal);
        }
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
