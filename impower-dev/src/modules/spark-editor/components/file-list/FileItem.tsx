import {
  Button,
  Check,
  ChevronRight,
  DropdownContent,
  DropdownRoot,
  DropdownTrigger,
  FolderFill,
  Ripple,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { createPortal, memo } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  iconForCategory,
  iconForPath,
  isImagePath,
} from "../../utils/fileIcon";
import {
  recordCreate,
  recordMove,
  recordReferenceRename,
  recordTrashDeletion,
} from "../../utils/fileUndo";
import { formatModified, getFileSizeDisplayValue } from "../../utils/fileMeta";
import workspace from "../../workspace/WorkspaceStore";
import DiagnosticsLabel from "./DiagnosticsLabel";
import FileMenuItems from "./FileMenuItems";
import FileOptionsButton from "./FileOptionsButton";
import FileUsagesPanel, { type UsageLocation } from "./FileUsagesPanel";
import RenameReferencesDialog from "./RenameReferencesDialog";

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
  /**
   * A remote/CDN asset (a `.url` file): show a small "remote" badge on the tile,
   * resolve the glyph/thumbnail from {@link category} (the URL's inferred medium)
   * rather than the `.url` extension, and load the thumbnail straight from the
   * remote `src` (the service-worker `?thumb=` resize only applies to local
   * files).
   */
  remote?: boolean;
  /**
   * Resolved media category (`image` | `audio` | `video` | `text`) for a
   * {@link remote} asset, from the worker's inferred `FileData.type`. Ignored
   * for local files (their category comes from the path extension).
   */
  category?: string;
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
  remote = false,
  category,
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
  // A pending asset rename whose name is referenced by scripts — the confirm
  // dialog (update refs vs rename-only) acts on these stored paths.
  const [renameConfirm, setRenameConfirm] = useState<{
    oldPath: string;
    newPath: string;
    fromName: string;
    toName: string;
    referenceCount: number;
    scriptCount: number;
  } | null>(null);
  // The "Used in (N)" panel for this asset — null when closed, else the asset
  // name + every script location that references it.
  const [usages, setUsages] = useState<{
    assetName: string;
    locations: UsageLocation[];
  } | null>(null);
  // A thumbnail that 404s / fails to decode falls back to the type glyph.
  const [thumbFailed, setThumbFailed] = useState(false);
  // Desktop right-click context menu position (viewport px), or null when closed.
  // Lazily mounted (like the 3-dots menu) so idle rows carry no Radix root.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);

  const basename = path.split("/").slice(-1)[0] ?? path;
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  // Folders display the whole segment; files split name/ext on the FINAL dot
  // (so multi-dot names keep interior dots).
  const dotIndex = basename.lastIndexOf(".");
  const name =
    isDirectory || dotIndex <= 0 ? basename : basename.slice(0, dotIndex);
  const ext = !isDirectory && dotIndex > 0 ? basename.slice(dotIndex + 1) : "";
  // Hide the extension for the formats that get their own dedicated panel, where
  // the extension is implied and just noise: `.sd` scripts and `.url` remote
  // assets (mirrors how the Scripts panel hides `.sd`).
  const showExt = ext && ext !== "sd" && ext !== "url";
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
  // A remote (`.url`) asset's glyph comes from its resolved medium, not the
  // `.url` extension (which would always be the generic link glyph).
  const FileIcon = remote
    ? iconForCategory(category)
    : iconForPath(path, isDirectory, expanded);
  // Show a live thumbnail for image assets once we have a url and it hasn't
  // failed to load. Thumbnails are pre-generated at import time (and the
  // <img> decodes async), so they can stay mounted while scrolling — no
  // deferral burst on settle, which used to wedge the next scroll. Remote
  // assets resolve image-ness from their inferred category (path ext is `.url`).
  const isImage = remote ? category === "image" : isImagePath(path);
  const showThumb = !isDirectory && !!src && !thumbFailed && isImage;
  // Google-Drive convention: files sit in a rounded tile (glyph or thumbnail);
  // folders are a bare, prominent icon with no tile. Mute only file *glyphs*
  // (not thumbnails, not folders) to /50 so they read as quiet chrome.
  const iconMuted = !isDirectory && !showThumb ? "opacity-50" : "";
  // Ask the service worker for a downscaled thumbnail (max 144px wide ≈ 4× the
  // 36px box for retina) so the page never decodes full-res art. The SW falls
  // back to the original bytes if it can't resize, so this is always safe.
  // Remote URLs are loaded as-is — the `?thumb=` resize is a service-worker
  // feature for local `/file:` URLs, and appending it could break a signed CDN
  // URL — so the browser just downscales the full remote image to the tile.
  const thumbSrc =
    showThumb && src
      ? remote
        ? src
        : `${src}${src.includes("?") ? "&" : "?"}thumb=144`
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

  async function plainMove(oldPath: string, newPath: string) {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const renamed = await Workspace.fs.moveFile(projectId, oldPath, newPath);
    if (renamed.some((d) => d.type === "script")) {
      await Workspace.window.recordScriptChange();
    } else {
      await Workspace.window.recordAssetChange();
    }
    recordMove(projectId, oldPath, newPath, false);
  }

  async function renameFile(oldPath: string, newPath: string) {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    // Does any script reference this asset by name? If so, confirm whether to
    // rewrite those references along with the rename (the references query and
    // the rename edits share the same engine, so the count is exact).
    let refs: { uri: string }[] = [];
    try {
      refs = await Workspace.ls.getFileReferences(
        Workspace.fs.getFileUri(projectId, oldPath),
      );
    } catch {
      refs = [];
    }
    if (refs.length === 0) {
      await plainMove(oldPath, newPath);
      return;
    }
    setRenameConfirm({
      oldPath,
      newPath,
      fromName: oldPath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? oldPath,
      toName: newPath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? newPath,
      referenceCount: refs.length,
      scriptCount: new Set(refs.map((r) => r.uri)).size,
    });
  }

  async function renameWithReferences(oldPath: string, newPath: string) {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    await Workspace.fs.renameFileWithReferences(projectId, oldPath, newPath);
    // Scripts changed (references) AND the asset moved.
    await Workspace.window.recordScriptChange();
    await Workspace.window.recordAssetChange();
    recordReferenceRename(projectId, oldPath, newPath);
  }

  // Open the "Used in (N)" panel: ask the language server which script
  // locations reference this asset by name, then surface them as tappable
  // jump-to-source rows. Opens even with zero results (shows a "No usages"
  // empty state) so the action always gives feedback.
  async function openUsages() {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    let refs: { uri: string; range: UsageLocation["range"] }[] = [];
    try {
      refs = await Workspace.ls.getFileReferences(
        Workspace.fs.getFileUri(projectId, path),
      );
    } catch {
      refs = [];
    }
    const locations: UsageLocation[] = refs.map((r) => ({
      uri: r.uri,
      label: Workspace.fs.getRelativePath(projectId, r.uri),
      line: r.range.start.line + 1,
      range: r.range,
    }));
    setUsages({ assetName: name, locations });
  }

  async function renameFolder(oldPath: string, newPath: string) {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    await Workspace.fs.moveFolder(projectId, oldPath, newPath);
    await Workspace.window.recordAssetChange();
    recordMove(projectId, oldPath, newPath, true);
  }

  // `"trash"` (the default, used by the 3-dots Delete) moves the entry to the
  // recycle bin (reversible); `"permanent"` is used to discard a brand-new
  // empty entry on Escape — there's nothing worth keeping, so don't clutter
  // the trash with it.
  async function deleteEntry(mode: "trash" | "permanent" = "trash") {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
    // Timestamp BEFORE the delete so the undo records exactly this delete's
    // trash batch, never an older same-path one.
    const since = Date.now();
    if (isDirectory) {
      const deleted = await Workspace.fs.deleteFolder(projectId, path, mode);
      await Workspace.window.recordAssetChange();
      if (mode === "trash") {
        await recordTrashDeletion(
          projectId,
          deleted.map((d) => d.uri),
          basename,
          since,
        );
      }
      return;
    }
    const uri = Workspace.fs.getFileUri(projectId, path);
    const deleted = await Workspace.fs.deleteFiles({ files: [{ uri }], mode });
    if (deleted.some((d) => d.type === "script")) {
      await Workspace.window.recordScriptChange();
    } else {
      await Workspace.window.recordAssetChange();
    }
    if (mode === "trash") {
      await recordTrashDeletion(projectId, [uri], basename, since);
    }
  }

  // Copy this file under a unique name in the SAME folder — `photo.png` ->
  // `photo copy.png` -> `photo copy 2.png` (Finder/VS Code convention). NOT the
  // getUniqueFileName/Keep-both scheme: that increments the FIRST embedded digit
  // (`mg1_changes.mid` -> `mg3_changes.mid`), which reads as a different asset.
  // Files only — folders would need a recursive copy. Reversible (undo trashes
  // the copy).
  async function duplicateEntry() {
    const projectId = workspace.signals.projectId.value;
    if (!projectId || isDirectory) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const srcUri = Workspace.fs.getFileUri(projectId, path);
    const data = await Workspace.fs.readFile({ file: { uri: srcUri } });
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
    // Sibling basenames (case-folded) in the original's folder, so the copy never
    // collides with an existing file there (or a same-named file in another folder).
    const files = await Workspace.fs.getFiles(projectId);
    const takenLc = new Set(
      Object.keys(files)
        .map((u) => Workspace.fs.getRelativePath(projectId, u))
        .filter(
          (rel) =>
            (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "") ===
            dir,
        )
        .map((rel) =>
          (rel.includes("/") ? rel.slice(rel.lastIndexOf("/") + 1) : rel).toLowerCase(),
        ),
    );
    const dotIdx = basename.lastIndexOf(".");
    const stem = dotIdx > 0 ? basename.slice(0, dotIdx) : basename;
    const fileExt = dotIdx > 0 ? basename.slice(dotIdx) : "";
    let copyName = `${stem} copy${fileExt}`;
    for (let n = 2; takenLc.has(copyName.toLowerCase()); n += 1) {
      copyName = `${stem} copy ${n}${fileExt}`;
    }
    const newUri = Workspace.fs.getFileUri(projectId, `${dir}${copyName}`);
    await Workspace.fs.createFiles({ files: [{ uri: newUri, data }] });
    if (ext === "sd") {
      await Workspace.window.recordScriptChange();
    } else {
      await Workspace.window.recordAssetChange();
    }
    recordCreate(projectId, [newUri], copyName);
  }

  // Save this file to the user's device. Reads the raw bytes and hands them to a
  // throwaway download anchor. Files only (a folder would need a zip — that's the
  // multi-select "Download"). For a `.url` ref this saves the `.url` text itself.
  async function downloadEntry() {
    const projectId = workspace.signals.projectId.value;
    if (!projectId || isDirectory) return;
    const { Workspace } = await import("../../workspace/Workspace");
    const { downloadFile } = await import("../../utils/downloadFile");
    const uri = Workspace.fs.getFileUri(projectId, path);
    const data = await Workspace.fs.readFile({ file: { uri } });
    downloadFile(basename, "application/octet-stream", data);
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
    e.preventDefault();
    e.stopPropagation();
    // Mobile (dive mode): a long-press fires `contextmenu` — enter multi-select,
    // the touch-friendly way to act on several files. Already selecting? keep
    // toggling. Desktop: open the options menu as a context menu at the cursor.
    if (diveMode || selectMode) {
      onContextSelect?.(path, isDirectory);
    } else {
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  }

  // The row's actions — shared by the 3-dots menu and the desktop right-click
  // context menu. Find-usages keys off the flat asset name (`image.foo`), so it's
  // assets only (not scripts/folders); Duplicate/Download are files only.
  const menuItemProps = {
    onRename: () => setRenaming(true),
    onDelete: () => void deleteEntry(),
    onFindUsages:
      !isDirectory && ext !== "sd" ? () => void openUsages() : undefined,
    onDuplicate: !isDirectory ? () => void duplicateEntry() : undefined,
    onDownload: !isDirectory ? () => void downloadEntry() : undefined,
  };

  // Re-render on diagnostics change (DiagnosticsLabel reads the same signal).
  const _ = useComputed(() => workspace.state.value.debug?.diagnostics).value;
  void _;

  return (
    // The row button and the 3-dots options button are SIBLINGS (not nested),
    // so hover/ripple land only on whichever is topmost under the pointer — a
    // <button> inside a <button> would share `:hover` (ancestor highlight) and
    // funnel the inner press's pointerdown up to the row's ripple.
    <div ref={rowRef} class="relative">
      <Button
        variant="ghost"
        class={`h-16 w-full justify-start gap-0 rounded-none pl-5 text-left text-base font-normal text-foreground/80 ${
          selectMode ? "pr-5" : "pr-14"
        } ${
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
              // Inline-edit swaps ONLY the name line, in place: the input
              // inherits the row's text-base and is given font-semibold, so it
              // sits at exactly the static name's size + baseline. The caption
              // line below renders in BOTH states (outside this branch) so the
              // column's vertical centering never shifts when editing opens.
              <div
                class="relative flex flex-row items-center overflow-hidden rounded"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {/* Auto-size the input to its text: an invisible mirror in the
                    same grid cell drives the width, so the preserved extension
                    below can sit snug right after the name — exactly like the
                    static row (which is `name` + greyed `.ext`). */}
                <span class="grid max-w-full grid-cols-[minmax(0,max-content)]">
                  <span
                    class="invisible min-w-[1ch] whitespace-pre text-base font-semibold [grid-area:1/1]"
                    aria-hidden="true"
                  >
                    {inputValue || " "}
                  </span>
                  <input
                    ref={inputRef}
                    value={inputValue}
                    // size=1 so the input's intrinsic width (default ~20ch)
                    // doesn't win the grid track's max-content sizing — the
                    // invisible mirror drives the width, and `w-full` fills it.
                    size={1}
                    onInput={(e) =>
                      setInputValue((e.target as HTMLInputElement).value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commit();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        // Canceling a brand-new entry removes the empty
                        // file/folder (VS Code); canceling a rename of an
                        // existing entry just reverts to its current name.
                        if (isNew) {
                          void deleteEntry("permanent");
                          onEndNewEntry?.();
                        }
                        setRenaming(false);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    class="w-full min-w-0 border-0 bg-transparent p-0 text-base font-semibold text-foreground outline-none [grid-area:1/1]"
                  />
                </span>
                {showExt && (
                  <span class="flex-none font-normal opacity-30">.{ext}</span>
                )}
                <Ripple />
              </div>
            ) : (
              <div class="flex flex-row items-center overflow-hidden text-ellipsis whitespace-nowrap">
                <span class="font-semibold">{name}</span>
                {showExt && <span class="font-normal opacity-30">.{ext}</span>}
              </div>
            )}
            {caption && (
              <div class="truncate text-xs text-foreground/60">{caption}</div>
            )}
            </div>
          </DiagnosticsLabel>
        </div>
      </Button>
      {/* Sibling overlay over the row's reserved right padding (pr-14): its own
          hover/ripple, isolated from the row button beneath it. */}
      {!selectMode && (
        <div class="absolute inset-y-0 right-0 flex items-center">
          <FileOptionsButton {...menuItemProps} />
        </div>
      )}
      {/* Desktop right-click context menu — the SAME items as the 3-dots, popped
          at the cursor. Lazily mounted (only while open) so idle rows carry no
          Radix root, and anchored to a 0-size element at the click point.
          PORTALED to <body>: the row lives inside the virtualizer's transformed
          container, where `position: fixed` resolves relative to that transform
          (not the viewport) — so the cursor anchor would be offset by the row's
          scroll translate without this. */}
      {contextMenu &&
        createPortal(
          <DropdownRoot
            defaultOpen
            onOpenChange={(open) => {
              if (!open) {
                window.setTimeout(() => setContextMenu(null), 250);
              }
            }}
          >
            <DropdownTrigger asChild>
              <span
                aria-hidden="true"
                class="pointer-events-none fixed h-0 w-0"
                style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
              />
            </DropdownTrigger>
            <DropdownContent
              align="start"
              side="bottom"
              sideOffset={2}
              // See FileOptionsButton — "Rename" focuses the inline input, so
              // don't let Radix pull focus back to the (about-to-unmount) trigger.
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <FileMenuItems {...menuItemProps} />
            </DropdownContent>
          </DropdownRoot>,
          document.body,
        )}
      {renameConfirm && (
        <RenameReferencesDialog
          open
          fromName={renameConfirm.fromName}
          toName={renameConfirm.toName}
          referenceCount={renameConfirm.referenceCount}
          scriptCount={renameConfirm.scriptCount}
          onUpdateAndRename={() => {
            const c = renameConfirm;
            setRenameConfirm(null);
            void renameWithReferences(c.oldPath, c.newPath);
          }}
          onRenameOnly={() => {
            const c = renameConfirm;
            setRenameConfirm(null);
            void plainMove(c.oldPath, c.newPath);
          }}
          onCancel={() => setRenameConfirm(null)}
        />
      )}
      {usages && (
        <FileUsagesPanel
          open
          assetName={usages.assetName}
          locations={usages.locations}
          onJump={(uri, range) => {
            void (async () => {
              const { Workspace } = await import("../../workspace/Workspace");
              await Workspace.window.showDocument(uri, range, true);
            })();
          }}
          onClose={() => setUsages(null)}
        />
      )}
    </div>
  );
}

// Memoized so a re-render of the (virtualized) FileList — which fires on every
// scroll frame — only re-renders rows whose props actually changed, instead of
// re-running all ~24 visible rows. Relies on FileList passing referentially
// stable props (notably a single `onToggle`, not a per-row closure).
export default memo(FileItem);
