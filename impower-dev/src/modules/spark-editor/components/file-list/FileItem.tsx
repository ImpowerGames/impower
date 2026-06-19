import {
  Button,
  Check,
  ChevronRight,
  FolderFill,
  Ripple,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { memo } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { iconForPath, isImagePath } from "../../utils/fileIcon";
import { formatModified, getFileSizeDisplayValue } from "../../utils/fileMeta";
import workspace from "../../workspace/WorkspaceStore";
import DiagnosticsLabel from "./DiagnosticsLabel";
import FileOptionsButton from "./FileOptionsButton";

// Per-depth indentation (px). The base padding + the fixed chevron column keep
// a depth-0 file's name at the same x it sat at in the old flat list. Exported
// so the sticky-folder headers (FileList) line up with the tree rows.
export const INDENT_PER_DEPTH = 16;
export const BASE_INDENT = 12;
// Cap the visual indent so a pathologically deep tree (the desktop inline view)
// never pushes the name off-screen. Past this depth the indent plateaus — the
// data still nests; only the indentation stops growing. On mobile the dive view
// renders every row at depth 0, so this never applies there.
export const MAX_INDENT_DEPTH = 8;

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
  /**
   * Dive mode (mobile): a folder row NAVIGATES into the folder instead of
   * expanding in place, so it shows a filled folder glyph rather than the
   * expand/collapse chevron (which would wrongly imply an inline tree).
   */
  diveMode?: boolean;
  /** Row is the file currently open in the editor (gets the selection accent). */
  selected?: boolean;
  /**
   * Service-worker-served URL of the file (`FileData.src`). For image assets
   * this is rendered as a live thumbnail inside the icon box; ignored for
   * everything else.
   */
  src?: string;
  /** Last-modified time (epoch ms) — shown as "Modified <age>" in the caption. */
  modified?: number;
  /** File size in bytes — shown as a human size in the caption. */
  size?: number;
  /**
   * Multi-select ("multi-editing") mode is active: the icon slot becomes a
   * checkbox, a row click toggles its selection, and the per-row 3-dots hides.
   */
  selectMode?: boolean;
  /** Whether this row is checked in multi-select mode. */
  bulkSelected?: boolean;
  /**
   * An entry just created from scratch (a "New Folder", or a blank script):
   * open straight into rename mode with the name preselected (VS Code UX), let
   * Escape REMOVE the still-empty entry instead of reverting to its placeholder
   * name, and — for a file (script) — open it in the editor once named.
   */
  isNew?: boolean;
  /**
   * Folder rows: toggle expand/collapse. Receives the row's own path so the
   * parent can pass a single STABLE callback (not a per-row closure), which
   * keeps {@link FileItem}'s props referentially stable for `memo`.
   */
  onToggle?: (path: string) => void;
  /** Toggle this row's selection (multi-select mode). Folders cascade to their
   * contents in the parent. */
  onToggleSelect?: (path: string, isDirectory: boolean) => void;
  /** Right-click / long-press: enter multi-select mode and select this row. */
  onContextSelect?: (path: string, isDirectory: boolean) => void;
  /** A new-entry rename session ended (committed, kept default, or canceled). */
  onEndNewEntry?: () => void;
  /**
   * Open a FILE on click. When provided it replaces the default "open in editor"
   * behavior — the Assets panes pass a handler that opens the preview overlay
   * instead. (Folders still toggle/navigate; this is files only.)
   */
  onOpenFile?: (path: string) => void;
};

/**
 * A single row in the file tree. Files open in the editor on click and offer
 * Rename + Delete; folders expand/collapse on click and Rename (moves the
 * folder) / Delete (removes the folder and its contents). The 3-dots menu's
 * Rename swaps the label for an inline input — Enter / blur / click-outside
 * commits, Escape cancels.
 */
function FileItem({
  path,
  isDirectory = false,
  depth = 0,
  hasChildren = false,
  expanded = false,
  diveMode = false,
  selected = false,
  src,
  modified,
  size,
  selectMode = false,
  bulkSelected = false,
  isNew = false,
  onToggle,
  onToggleSelect,
  onContextSelect,
  onEndNewEntry,
  onOpenFile,
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
  // Files show a "Modified <age> | <size>" caption under the name (matching the
  // legacy engine's file list). Folders carry no such metadata → no caption.
  const caption = isDirectory
    ? ""
    : [formatModified(modified), getFileSizeDisplayValue(size)]
        .filter(Boolean)
        .join(" | ");

  // File-type glyph (folders → Binder). An expanded folder shows its icon at
  // full weight; everything else is muted to /50 so the icon reads as chrome,
  // not content. The icon sits inside DiagnosticsLabel so it inherits the
  // danger/warning color (via currentColor) when the row has a diagnostic.
  const FileIcon = iconForPath(path, isDirectory, expanded);
  // Show a live thumbnail for image assets once we have a url and it hasn't
  // failed to load. Thumbnails are pre-generated at import time (and the
  // <img> decodes async), so they can stay mounted while scrolling — no
  // deferral burst on settle, which used to wedge the next scroll.
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

  // The virtualized list RECYCLES this component across rows (keyed by window
  // slot, not path), so when the underlying file changes — e.g. the user
  // scrolls while a rename is open — drop the stale rename rather than letting
  // the input jump to a different file.
  useEffect(() => {
    setRenaming(false);
  }, [path]);

  // A freshly-created folder opens straight into rename mode (VS Code "New
  // Folder"). Runs AFTER the recycle reset above so it wins on the render where
  // the new folder's row first appears in this slot.
  useEffect(() => {
    if (isNew) setRenaming(true);
  }, [isNew, path]);

  // Auto-focus + select the ENTIRE editable name when entering rename mode
  // (files and folders alike). The input value is controlled, so selecting
  // synchronously here would run against the still-empty input (the new value
  // lands on the next render) — defer to a rAF so `select()` covers the value
  // that's actually in the DOM.
  useEffect(() => {
    if (!renaming) return;
    setInputValue(name ?? "");
    const id = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
    return () => cancelAnimationFrame(id);
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

  async function commit() {
    const newName = inputValue.trim();
    const renamed = !!newName && newName !== name;
    let finalPath = path;
    // Close the input immediately so dismissal feels snappy; the rename (and,
    // for a new script, the open) proceed underneath.
    setRenaming(false);
    if (renamed) {
      if (isDirectory) {
        // Folder: rename in place (same parent), moving everything beneath it.
        void renameFolder(path, dir ? `${dir}/${newName}` : newName);
      } else {
        const newBasename = ext ? `${newName}.${ext}` : newName;
        finalPath = dir ? `${dir}/${newBasename}` : newBasename;
        // Await so the file exists at its new path before we open it below.
        await renameFile(path, finalPath);
      }
    }
    if (isNew) {
      // The create session is over (named, kept the default, or clicked away).
      onEndNewEntry?.();
      // A freshly-created FILE (a blank script) opens for editing once it's
      // named — the create flow defers the open until after the inline rename
      // so the editor never steals focus from the name input.
      if (!isDirectory) {
        const { Workspace } = await import("../../workspace/Workspace");
        Workspace.window.openFileEditor(finalPath);
      }
    }
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
    // Multi-select mode: a row click toggles its checkbox instead of opening it.
    if (selectMode) {
      onToggleSelect?.(path, isDirectory);
      return;
    }
    if (isDirectory) {
      onToggle?.(path);
      return;
    }
    if (onOpenFile) {
      onOpenFile(path);
      return;
    }
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.openFileEditor(path);
  }

  function onRowContextMenu(e: MouseEvent) {
    // Right-click enters multi-select mode (if not already) and selects this row.
    e.preventDefault();
    e.stopPropagation();
    onContextSelect?.(path, isDirectory);
  }

  // Re-render on diagnostics change (DiagnosticsLabel reads the same signal).
  const _ = useComputed(() => workspace.state.value.debug?.diagnostics).value;
  void _;

  return (
    <Button
      ref={rowRef}
      variant="ghost"
      class={`h-16 w-full justify-start gap-0 rounded-none px-5 text-left text-base font-normal text-foreground/80 ${
        selectMode
          ? bulkSelected
            ? "bg-primary/15"
            : ""
          : selected
            ? "bg-engine-800/40 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary before:content-['']"
            : ""
      }`}
      onClick={onRowClick}
      onContextMenu={onRowContextMenu}
    >
      <div
        class="relative flex flex-1 flex-row items-center overflow-hidden"
        style={{
          paddingLeft: `${BASE_INDENT + Math.min(depth, MAX_INDENT_DEPTH) * INDENT_PER_DEPTH}px`,
        }}
      >
        <DiagnosticsLabel filename={path}>
          {/* Icon column: FILES sit in a rounded tile holding the type glyph or
              a live image thumbnail; FOLDERS show a rotating disclosure chevron
              in the same slot (no tile) — the chevron IS the folder's glyph. The
              size-9 footprint is shared so names stay aligned. Inside
              DiagnosticsLabel so the fallback glyph goes red/amber with the name
              on a diagnostic (currentColor). */}
          {selectMode ? (
            // Multi-select: the icon slot becomes a checkbox.
            <span class="mr-3 flex size-10 flex-none items-center justify-center text-foreground/60">
              <span
                class={`flex size-5 items-center justify-center rounded border-2 transition-colors ${
                  bulkSelected
                    ? "border-primary bg-primary text-white"
                    : "border-foreground/40"
                }`}
              >
                {bulkSelected && <Check class="size-3.5" />}
              </span>
            </span>
          ) : (
            <span
              class={`mr-3 flex size-10 flex-none items-center justify-center ${
                isDirectory
                  ? "text-foreground/60"
                  : `overflow-hidden rounded-lg bg-engine-800/60 ring-1 ring-inset ring-foreground/10 ${iconMuted}`
              }`}
            >
              {isDirectory ? (
                diveMode ? (
                  // Dive mode: tapping NAVIGATES into the folder — a filled
                  // folder glyph (not the expand/collapse chevron, which would
                  // imply an inline tree). Drive convention: folders stay unboxed.
                  <FolderFill class="size-6" />
                ) : (
                  <ChevronRight
                    class={`size-5 transition-transform ${expanded ? "rotate-90" : ""} ${
                      hasChildren ? "" : "opacity-40"
                    }`}
                  />
                )
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
          )}
          <div class="flex min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden pr-2">
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
                      // Canceling a brand-new entry removes the empty file/folder
                      // (VS Code); canceling a rename of an existing entry just
                      // reverts to its current name.
                      if (isNew) {
                        void deleteEntry();
                        onEndNewEntry?.();
                      }
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
                <div class="flex flex-row items-center overflow-hidden text-ellipsis whitespace-nowrap">
                  <span class="font-semibold">{name}</span>
                  {showExt && (
                    <span class="font-normal opacity-30">.{ext}</span>
                  )}
                </div>
                {caption && (
                  <div class="truncate text-xs text-foreground/60">
                    {caption}
                  </div>
                )}
              </>
            )}
          </div>
        </DiagnosticsLabel>
      </div>
      {!selectMode && (
        <FileOptionsButton
          onRename={() => setRenaming(true)}
          onDelete={() => void deleteEntry()}
        />
      )}
    </Button>
  );
}

// Memoized so a re-render of the (virtualized) FileList — which fires on every
// scroll frame — only re-renders rows whose props actually changed, instead of
// re-running all ~24 visible rows. Relies on FileList passing referentially
// stable props (notably a single `onToggle`, not a per-row closure).
export default memo(FileItem);
