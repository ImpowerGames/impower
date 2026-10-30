import {
  Button,
  Check,
  ChevronRight,
  Download,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
  FolderFill,
  Ripple,
  Trash,
} from "@impower/impower-ui/components";
import { useComputed, useSignalEffect } from "@preact/signals";
import { createPortal, memo } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  iconForCategory,
  iconForPath,
  isImagePath,
} from "../../utils/fileIcon";
import {
  recordMove,
  recordReferenceRename,
  recordTrashDeletion,
} from "../../utils/fileUndo";
import { formatModified, getFileSizeDisplayValue } from "../../utils/fileMeta";
import workspace from "../../workspace/WorkspaceStore";
import DiagnosticsLabel from "./DiagnosticsLabel";
import FileMenuItems from "./FileMenuItems";
import { openRowMenu } from "./openRowMenu";
import FileOptionsButton from "./FileOptionsButton";
import FileUsagesPanel, { type UsageLocation } from "./FileUsagesPanel";
import RenameReferencesDialog from "./RenameReferencesDialog";

export const INDENT_PER_DEPTH = 16;
export const BASE_INDENT = 12;
export const MAX_INDENT_DEPTH = 8;

export type FileItemProps = {
  path: string;
  isDirectory?: boolean;
  depth?: number;
  hasChildren?: boolean;
  expanded?: boolean;
  diveMode?: boolean;
  selected?: boolean;
  src?: string;
  remote?: boolean;
  category?: string;
  modified?: number;
  size?: number;
  selectMode?: boolean;
  bulkSelected?: boolean;
  isNew?: boolean;
  isDraft?: boolean;
  onDraftCommitting?: (name: string, finalPath: string) => void;
  onToggle?: (path: string) => void;
  onToggleSelect?: (path: string, isDirectory: boolean) => void;
  onRangeSelect?: (path: string, isDirectory: boolean) => void;
  onReplaceSelect?: (path: string) => void;
  selectionCount?: number;
  onDeleteSelected?: () => void;
  onDownloadSelected?: () => void;
  onContextSelect?: (path: string, isDirectory: boolean) => void;
  onEndNewEntry?: () => void;
  onFolderRenamed?: (oldPath: string, newPath: string) => void;
  onOpenFile?: (path: string) => void;
};

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
  isDraft = false,
  onToggle,
  onToggleSelect,
  onRangeSelect,
  onReplaceSelect,
  selectionCount = 0,
  onDeleteSelected,
  onDownloadSelected,
  onContextSelect,
  onEndNewEntry,
  onDraftCommitting,
  onFolderRenamed,
  onOpenFile,
}: FileItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [committedName, setCommittedName] = useState<string | null>(null);
  const [renameConfirm, setRenameConfirm] = useState<{
    oldPath: string;
    newPath: string;
    fromName: string;
    toName: string;
    referenceCount: number;
    scriptCount: number;
  } | null>(null);
  const [usages, setUsages] = useState<{
    assetName: string;
    locations: UsageLocation[];
  } | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    bulk: boolean;
  } | null>(null);
  const ctxMenuKeyRef = useRef<symbol | null>(null);
  if (!ctxMenuKeyRef.current) {
    ctxMenuKeyRef.current = Symbol();
  }
  useSignalEffect(() => {
    if (openRowMenu.value !== ctxMenuKeyRef.current) {
      setContextMenu(null);
    }
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);

  const basename = path.split("/").slice(-1)[0] ?? path;
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const dotIndex = basename.lastIndexOf(".");
  const name =
    isDirectory || dotIndex <= 0 ? basename : basename.slice(0, dotIndex);
  const ext = !isDirectory && dotIndex > 0 ? basename.slice(dotIndex + 1) : "";
  const showExt = ext && ext !== "sd" && ext !== "url";
  const caption = isDirectory
    ? ""
    : [formatModified(modified), getFileSizeDisplayValue(size)]
        .filter(Boolean)
        .join(" | ");

  const FileIcon = remote
    ? iconForCategory(category)
    : iconForPath(path, isDirectory, expanded);
  const isImage = remote ? category === "image" : isImagePath(path);
  const showThumb = !isDirectory && !!src && !thumbFailed && isImage;
  const iconMuted = !isDirectory && !showThumb ? "opacity-50" : "";
  const thumbSrc =
    showThumb && src
      ? remote
        ? src
        : `${src}${src.includes("?") ? "&" : "?"}thumb=144`
      : undefined;

  useEffect(() => {
    setThumbFailed(false);
  }, [src]);

  useEffect(() => {
    setRenaming(false);
    setCommittedName(null);
  }, [path]);

  useEffect(() => {
    if (isNew) setRenaming(true);
  }, [isNew, path]);

  useEffect(() => {
    if (!renaming) return;
    setInputValue(isNew && !isDirectory ? "" : (name ?? ""));
    const id = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [renaming, name, isNew, isDirectory]);

  useEffect(() => {
    if (!renaming) return;
    const onDoc = (e: MouseEvent) => {
      const composed =
        typeof e.composedPath === "function" ? e.composedPath() : [];
      if (rowRef.current && !composed.includes(rowRef.current)) {
        commit();
      }
    };
    document.addEventListener("click", onDoc, true);
    return () => document.removeEventListener("click", onDoc, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming, inputValue]);

  async function commit() {
    const newName = inputValue.trim();
    const renamed = !!newName && newName !== name;
    const newBasename = ext ? `${newName}.${ext}` : newName;
    const finalPath = renamed
      ? dir
        ? `${dir}/${newBasename}`
        : newBasename
      : path;
    if (isDraft) {
      setRenaming(false);
      if (!newName) {
        onEndNewEntry?.();
        return;
      }
      setCommittedName(newName);
      const { Workspace } = await import("../../workspace/Workspace");
      const projectId = workspace.signals.projectId.value;
      if (!projectId) {
        onEndNewEntry?.();
        return;
      }
      onDraftCommitting?.(newName, finalPath);
      Workspace.window.openFileEditor(finalPath);
      await Workspace.fs.createFiles({
        files: [
          {
            uri: Workspace.fs.getFileUri(projectId, finalPath),
            data: new ArrayBuffer(0),
          },
        ],
      });
      if (ext === "sd") {
        await Workspace.window.recordScriptChange();
      } else {
        await Workspace.window.recordAssetChange();
      }
      return;
    }
    if (isNew && !isDirectory) {
      setRenaming(false);
      if (!newName) {
        void deleteEntry("permanent");
        onEndNewEntry?.();
        return;
      }
      if (renamed) setCommittedName(newName);
      const { Workspace } = await import("../../workspace/Workspace");
      const projectId = workspace.signals.projectId.value;
      Workspace.window.openFileEditor(finalPath);
      if (renamed && projectId) {
        const moved = await Workspace.fs.moveFile(projectId, path, finalPath);
        if (moved.some((d) => d.type === "script")) {
          await Workspace.window.recordScriptChange();
        } else {
          await Workspace.window.recordAssetChange();
        }
        recordMove(projectId, path, finalPath, false);
      }
      onEndNewEntry?.();
      return;
    }
    setRenaming(false);
    if (renamed) {
      if (isDirectory) {
        void renameFolder(path, dir ? `${dir}/${newName}` : newName);
      } else {
        await renameFile(path, finalPath);
      }
    }
    if (isNew) {
      onEndNewEntry?.();
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
    await Workspace.window.recordScriptChange();
    await Workspace.window.recordAssetChange();
    recordReferenceRename(projectId, oldPath, newPath);
  }

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
    onFolderRenamed?.(oldPath, newPath);
    await Workspace.window.recordAssetChange();
    recordMove(projectId, oldPath, newPath, true);
  }

  async function deleteEntry(mode: "trash" | "permanent" = "trash") {
    const projectId = workspace.signals.projectId.value;
    if (!projectId) return;
    const { Workspace } = await import("../../workspace/Workspace");
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
    if (renaming) {
      e.stopPropagation();
      commit();
      if (isDirectory) {
        onReplaceSelect?.(path);
        onToggle?.(path);
      }
      return;
    }
    e.stopPropagation();
    if (selectMode) {
      onToggleSelect?.(path, isDirectory);
      return;
    }
    if (!diveMode && e.shiftKey) {
      e.preventDefault();
      onRangeSelect?.(path, isDirectory);
      return;
    }
    if (!diveMode && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onToggleSelect?.(path, isDirectory);
      return;
    }
    onReplaceSelect?.(path);
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
    if (diveMode || selectMode) {
      onContextSelect?.(path, isDirectory);
      return;
    }
    const inMultiSelection = bulkSelected && selectionCount > 1;
    if (!bulkSelected) {
      onReplaceSelect?.(path);
    }
    openRowMenu.value = ctxMenuKeyRef.current;
    setContextMenu({ x: e.clientX, y: e.clientY, bulk: inMultiSelection });
  }

  const menuItemProps = {
    onRename: () => setRenaming(true),
    onDelete: () => void deleteEntry(),
    onFindUsages:
      !isDirectory && ext !== "sd" ? () => void openUsages() : undefined,
    onDownload: !isDirectory ? () => void downloadEntry() : undefined,
  };

  const _ = useComputed(() => workspace.state.value.debug?.diagnosticsSummary)
    .value;
  void _;

  return (
    <div ref={rowRef} class="relative">
      <Button
        variant="ghost"
        class={`h-16 w-full justify-start gap-0 rounded-none pl-5 text-left text-base font-normal text-foreground/80 ${
          selectMode ? "pr-5" : "pr-14"
        } ${
          bulkSelected || contextMenu
            ? "bg-primary/15"
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

          {selectMode ? (
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
                  <FolderFill class="size-6" />
                ) : (
                  <ChevronRight
                    class={`size-5 transition-transform ${expanded ? "rotate-90" : ""} ${
                      hasChildren ? "" : "opacity-40"
                    }`}
                  />
                )
              ) : showThumb ? (
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
                class="relative flex flex-row items-center overflow-hidden rounded"
                onPointerDown={(e) => e.stopPropagation()}
              >

                <span class="grid max-w-full grid-cols-[minmax(0,max-content)]">
                  <span
                    class={`invisible whitespace-pre text-base font-semibold [grid-area:1/1] ${
                      isNew && !isDirectory ? "min-w-[10ch]" : "min-w-[1ch]"
                    }`}
                    aria-hidden="true"
                  >
                    {inputValue || " "}
                  </span>
                  <input
                    ref={inputRef}
                    value={inputValue}
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
                        if (isNew) {
                          if (!isDraft) void deleteEntry("permanent");
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

                <span class="font-semibold">
                  {committedName ?? (isNew && !isDirectory ? "" : name)}
                </span>
                {showExt && !(isNew && !isDirectory) && (
                  <span class="font-normal opacity-30">.{ext}</span>
                )}
              </div>
            )}
            {caption && (
              <div class="truncate text-xs text-foreground/60">{caption}</div>
            )}
            </div>
          </DiagnosticsLabel>
        </div>
      </Button>

      {!selectMode && (
        <div class="absolute inset-y-0 right-0 flex items-center">
          <FileOptionsButton {...menuItemProps} />
        </div>
      )}

      {contextMenu &&
        createPortal(
          <DropdownRoot
            defaultOpen
            onOpenChange={(open) => {
              if (!open) {
                window.setTimeout(() => {
                  setContextMenu(null);
                  if (openRowMenu.value === ctxMenuKeyRef.current) {
                    openRowMenu.value = null;
                  }
                }, 250);
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
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              {contextMenu.bulk ? (
                <>
                  <DropdownItem onSelect={() => onDownloadSelected?.()}>
                    <Download class="size-4" />
                    Download {selectionCount} items
                  </DropdownItem>
                  <DropdownItem onSelect={() => onDeleteSelected?.()}>
                    <Trash class="size-4" />
                    Delete {selectionCount} items
                  </DropdownItem>
                </>
              ) : (
                <FileMenuItems {...menuItemProps} />
              )}
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

export default memo(FileItem);
