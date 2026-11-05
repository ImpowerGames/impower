import { useEffect } from "preact/hooks";
import { canRedo, canUndo, redo, undo } from "../../utils/undoManager";

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
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        const { Workspace } = await import("../../workspace/Workspace");
        await Workspace.window.syncProject();
        return;
      }
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === "z" || key === "y")) {
        if (isEditableFocus()) {
          return;
        }
        const isRedo = key === "y" || (key === "z" && e.shiftKey);
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
