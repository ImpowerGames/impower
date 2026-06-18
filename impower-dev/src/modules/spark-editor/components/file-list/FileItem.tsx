import { Button, ChevronRight, Ripple } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import { iconForPath, isImagePath } from "../../utils/fileIcon";
import workspace from "../../workspace/WorkspaceStore";
import DiagnosticsLabel from "./DiagnosticsLabel";
import FileOptionsButton from "./FileOptionsButton";

// Per-depth indentation (px). The base padding + the fixed chevron column keep
// a depth-0 file's name at the same x it sat at in the old flat list.
const INDENT_PER_DEPTH = 16;
const BASE_INDENT = 12;

export type FileItemProps = {
  /**
   * Project-relative path — `chapters/intro.sd` for a file, `chapters` for a
   * folder. The row's identity: rename/delete/open/diagnostics all key off the
   * full path so same-basename files in different folders never collide.
   */
  path: string;
  /** True for a folder row (click toggles expand instead of opening an editor). */
  isDirectory?: boolean;
  /** Tree depth (0 = top level) — drives indentation. */
  depth?: number;
  /** Folder has ≥1 child (renders a disclosure chevron). */
  hasChildren?: boolean;
  /** Folder is expanded (chevron points down). */
  expanded?: boolean;
  /** Row is the file currently open in the editor (gets the selection accent). */
  selected?: boolean;
  /**
   * Service-worker-served URL of the file (`FileData.src`). For image assets
   * this is rendered as a live thumbnail inside the icon box; ignored for
   * everything else.
   */
  src?: string;
  /** Folder rows: toggle expand/collapse. */
  onToggle?: () => void;
};

/**
 * A single row in the file tree. Files open in the editor on click and offer
 * Rename + Delete; folders expand/collapse on click and Rename (moves the
 * folder) / Delete (removes the folder and its contents). The 3-dots menu's
 * Rename swaps the label for an inline input — Enter / blur / click-outside
 * commits, Escape cancels.
 */
export default function FileItem({
  path,
  isDirectory = false,
  depth = 0,
  hasChildren = false,
  expanded = false,
  selected = false,
  src,
  onToggle,
}: FileItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [inputValue, setInputValue] = useState("");
  // A thumbnail that 404s / fails to decode falls back to the type glyph.
  const [thumbFailed, setThumbFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rowRef = useRef<HTMLButtonElement | null>(null);

  const basename = path.split("/").slice(-1)[0] ?? path;
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  // Folders display the whole segment; files split name/ext on the FINAL dot
  // (so multi-dot names keep interior dots).
  const dotIndex = basename.lastIndexOf(".");
  const name =
    isDirectory || dotIndex <= 0 ? basename : basename.slice(0, dotIndex);
  const ext = !isDirectory && dotIndex > 0 ? basename.slice(dotIndex + 1) : "";
  const showExt = ext && ext !== "sd";

  // File-type glyph (folders → Binder). An expanded folder shows its icon at
  // full weight; everything else is muted to /50 so the icon reads as chrome,
  // not content. The icon sits inside DiagnosticsLabel so it inherits the
  // danger/warning color (via currentColor) when the row has a diagnostic.
  const FileIcon = iconForPath(path, isDirectory, expanded);
  // Show a live thumbnail for image assets, but only once we actually have a
  // url and it hasn't failed to load.
  const showThumb = !isDirectory && !!src && !thumbFailed && isImagePath(path);
  // Google-Drive convention: files sit in a rounded tile (glyph or thumbnail);
  // folders are a bare, prominent icon with no tile. Mute only file *glyphs*
  // (not thumbnails, not folders) to /50 so they read as quiet chrome.
  const iconMuted = !isDirectory && !showThumb ? "opacity-50" : "";
  // Ask the service worker for a downscaled thumbnail (max 144px wide ≈ 4× the
  // 36px box for retina) so the page never decodes full-res art. The SW falls
  // back to the original bytes if it can't resize, so this is always safe.
  const thumbSrc =
    showThumb && src
      ? `${src}${src.includes("?") ? "&" : "?"}thumb=144`
      : undefined;

  // Re-arm the thumbnail when the row's url changes (e.g. after a cache-bust or
  // a move) so a previously-broken image gets another chance.
  useEffect(() => {
    setThumbFailed(false);
  }, [src]);

  // Auto-focus + select the editable name when entering rename mode.
  useEffect(() => {
    if (!renaming) return;
    setInputValue(name ?? "");
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(0, (name ?? "").length);
    }
  }, [renaming, name]);

  // Click-outside commits (if changed) and exits rename mode.
  useEffect(() => {
    if (!renaming) return;
    const onDoc = (e: MouseEvent) => {
      const composed =
        typeof e.composedPath === "function" ? e.composedPath() : [];
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
      if (isDirectory) {
        // Folder: rename in place (same parent), moving everything beneath it.
        void renameFolder(path, dir ? `${dir}/${newName}` : newName);
      } else {
        const newBasename = ext ? `${newName}.${ext}` : newName;
        void renameFile(path, dir ? `${dir}/${newBasename}` : newBasename);
      }
    }
    setRenaming(false);
  }

  async function renameFile(oldPath: string, newPath: string) {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const renamed = await Workspace.fs.moveFile(projectId, oldPath, newPath);
    if (renamed.some((d) => d.type === "script")) {
      await Workspace.window.recordScriptChange();
    } else {
      await Workspace.window.recordAssetChange();
    }
  }

  async function renameFolder(oldPath: string, newPath: string) {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    await Workspace.fs.moveFolder(projectId, oldPath, newPath);
    await Workspace.window.recordAssetChange();
  }

  async function deleteEntry() {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    if (isDirectory) {
      await Workspace.fs.deleteFolder(projectId, path);
      await Workspace.window.recordAssetChange();
      return;
    }
    const uri = Workspace.fs.getFileUri(projectId, path);
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
    if (isDirectory) {
      onToggle?.();
      return;
    }
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.openFileEditor(path);
  }

  // Re-render on diagnostics change (DiagnosticsLabel reads the same signal).
  const _ = useComputed(() => workspace.state.value.debug?.diagnostics).value;
  void _;

  return (
    <Button
      ref={rowRef}
      variant="ghost"
      class={`h-14 w-full justify-start gap-0 rounded-none px-5 text-left text-base font-normal text-foreground/80 ${
        selected
          ? "bg-engine-800/40 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary before:content-['']"
          : ""
      }`}
      onClick={onRowClick}
    >
      <div
        class="relative flex flex-1 flex-row items-center overflow-hidden"
        style={{ paddingLeft: `${BASE_INDENT + depth * INDENT_PER_DEPTH}px` }}
      >
        {/* Indent guides: one faint 1px vertical rule per ancestor depth,
            centered in each indentation step (VS Code's containment lines).
            Absolutely positioned so they ride the row's transform and stay
            pixel-aligned with the name's left padding. */}
        {Array.from({ length: depth }, (_unused, i) => (
          <span
            key={i}
            aria-hidden="true"
            class="pointer-events-none absolute inset-y-0 w-px bg-foreground/10"
            style={{
              left: `${BASE_INDENT + i * INDENT_PER_DEPTH + INDENT_PER_DEPTH / 2}px`,
            }}
          />
        ))}
        <DiagnosticsLabel filename={path}>
          {/* Icon column: FILES sit in a rounded tile holding the type glyph or
              a live image thumbnail; FOLDERS show a rotating disclosure chevron
              in the same slot (no tile) — the chevron IS the folder's glyph. The
              size-9 footprint is shared so names stay aligned. Inside
              DiagnosticsLabel so the fallback glyph goes red/amber with the name
              on a diagnostic (currentColor). */}
          <span
            class={`mr-3 flex size-9 flex-none items-center justify-center ${
              isDirectory
                ? "text-foreground/60"
                : `overflow-hidden rounded-lg bg-engine-800/60 ring-1 ring-inset ring-foreground/10 ${iconMuted}`
            }`}
          >
            {isDirectory ? (
              <ChevronRight
                class={`size-5 transition-transform ${expanded ? "rotate-90" : ""} ${
                  hasChildren ? "" : "opacity-40"
                }`}
              />
            ) : showThumb ? (
              // No loading="lazy": the virtualizer already mounts only
              // visible+overscan rows (its own windowing), and native lazy
              // loading fails to trigger inside its transformed rows — leaving
              // visible thumbnails unloaded. Eager + async decode is correct.
              <img
                src={thumbSrc}
                decoding="async"
                alt=""
                class="size-full object-cover"
                onError={() => setThumbFailed(true)}
              />
            ) : (
              <FileIcon class="size-5" />
            )}
          </span>
          <div class="flex flex-1 flex-row items-center overflow-hidden text-ellipsis whitespace-nowrap">
            {renaming ? (
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
                <span class={isDirectory ? "font-medium" : ""}>{name}</span>
                {showExt && <span class="opacity-30">.{ext}</span>}
              </>
            )}
          </div>
        </DiagnosticsLabel>
      </div>
      <FileOptionsButton
        onRename={() => setRenaming(true)}
        onDelete={() => void deleteEntry()}
      />
    </Button>
  );
}
