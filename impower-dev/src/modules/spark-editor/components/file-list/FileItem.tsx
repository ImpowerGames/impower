import { Button, Ripple } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";
import DiagnosticsLabel from "./DiagnosticsLabel";
import FileOptionsButton from "./FileOptionsButton";

export type FileItemProps = {
  filename: string;
};

/**
 * A single row in FileList. Clicking the row body opens the file in the
 * Logic editor. The 3-dots menu offers Rename + Delete. Rename swaps the
 * label for an inline text input — Enter / blur / click-outside commits;
 * Escape (or no-change) cancels.
 *
 * Diagnostics-aware: the filename is wrapped in `<DiagnosticsLabel>` so
 * rows for scripts with errors paint red / warnings paint yellow.
 */
export default function FileItem({ filename }: FileItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rowRef = useRef<HTMLButtonElement | null>(null);

  const [name, ext] = filename.split(".");
  const showExt = ext && ext !== "sd";

  // Auto-focus + select the basename when entering rename mode. Match the
  // legacy behavior: select up to (but not including) the extension.
  useEffect(() => {
    if (!renaming) return;
    setInputValue(name ?? "");
    const el = inputRef.current;
    if (el) {
      el.focus();
      const sel = (name ?? "").length;
      el.setSelectionRange(0, sel);
    }
  }, [renaming, name]);

  // Click-outside cancels (commits if changed).
  useEffect(() => {
    if (!renaming) return;
    const onDoc = (e: MouseEvent) => {
      const composed = typeof e.composedPath === "function" ? e.composedPath() : [];
      if (rowRef.current && !composed.includes(rowRef.current)) {
        commit();
      }
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming, inputValue]);

  function commit() {
    const newName = inputValue.trim();
    if (newName && newName !== name) {
      const newFilename = ext ? `${newName}.${ext}` : newName;
      void rename(filename, newFilename);
    }
    setRenaming(false);
  }

  async function rename(oldFilename: string, newFilename: string) {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const oldUri = Workspace.fs.getFileUri(projectId, oldFilename);
    const newUri = Workspace.fs.getFileUri(projectId, newFilename);
    const renamed = await Workspace.fs.renameFiles({
      files: [{ oldUri, newUri }],
    });
    if (renamed.some((d) => d.type === "script")) {
      await Workspace.window.recordScriptChange();
    } else {
      await Workspace.window.recordAssetChange();
    }
  }

  async function deleteFile() {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const uri = Workspace.fs.getFileUri(projectId, filename);
    const deleted = await Workspace.fs.deleteFiles({ files: [{ uri }] });
    if (deleted.some((d) => d.type === "script")) {
      await Workspace.window.recordScriptChange();
    } else {
      await Workspace.window.recordAssetChange();
    }
  }

  async function onRowClick(e: MouseEvent) {
    if (renaming) return;
    e.stopPropagation();
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.openFileEditor(filename);
  }

  // Workspace state derived from signals (re-render on relevant change only).
  const _ = useComputed(() => workspace.state.value.debug?.diagnostics).value;
  void _;

  return (
    <Button
      ref={rowRef}
      variant="ghost"
      class="h-14 w-full justify-start gap-0 rounded-none px-5 text-left text-base font-normal text-foreground/80"
      onClick={onRowClick}
    >
      <div class="flex flex-1 flex-row items-center overflow-hidden pl-8">
        <DiagnosticsLabel filename={filename}>
          <div class="flex flex-1 flex-row items-center overflow-hidden text-ellipsis whitespace-nowrap">
            {renaming ? (
              // Ripple wrapper mirrors main's <s-input> tap ripple. stopPropagation
              // on pointerDown so the wave fires here (not on the enclosing row
              // Button, which would otherwise double-ripple); text-foreground
              // (white) pins the wave white like main. The row already supplies
              // the hover tint underneath, so no hover:bg here.
              <div
                class="relative w-full overflow-hidden rounded text-foreground"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <input
                  ref={inputRef}
                  value={inputValue}
                  onInput={(e) =>
                    setInputValue((e.target as HTMLInputElement).value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commit();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setRenaming(false);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  class="w-full bg-transparent text-foreground outline-none"
                />
                <Ripple />
              </div>
            ) : (
              <>
                <span>{name}</span>
                {showExt && <span class="opacity-30">.{ext}</span>}
              </>
            )}
          </div>
        </DiagnosticsLabel>
      </div>
      <FileOptionsButton
        onRename={() => setRenaming(true)}
        onDelete={() => void deleteFile()}
      />
    </Button>
  );
}
