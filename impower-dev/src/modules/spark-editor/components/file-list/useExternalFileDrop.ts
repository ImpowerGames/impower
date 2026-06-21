import { useEffect, useRef, useState } from "preact/hooks";

// Native HTML5 drag-and-drop for OS files dropped ONTO a file list — distinct
// from useTreeDrag (which moves rows WITHIN the tree via pointer events). An OS
// file drag fires `dragenter/over/leave/drop` with a populated `dataTransfer`;
// internal row drags never carry the "Files" type, so the two never collide.

export interface ExternalDropFile {
  name: string;
  getBuffer: () => Promise<ArrayBuffer>;
}

export interface ExternalFileDrop {
  /** A loose-file drag is currently hovering this list. */
  active: boolean;
  /** Folder path under the cursor (a `data-dir="1"` row), or null (→ pane scope). */
  targetFolder: string | null;
}

const carriesFiles = (dt: DataTransfer | null) =>
  !!dt && Array.from(dt.types).includes("Files");

// Best-effort "this drag is a single .zip" check. During a drag only
// `items[].type` (MIME) is readable, NOT filenames — so a zip with an empty/
// unknown MIME falls through to false here and the DROP handler re-checks by
// filename. Used to let the window-level "Import Project" overlay own zips while
// this list owns loose-asset drops.
const looksLikeZip = (dt: DataTransfer | null) => {
  if (!dt) return false;
  const items = Array.from(dt.items).filter((i) => i.kind === "file");
  return items.length === 1 && /zip/i.test(items[0]!.type);
};

/**
 * Wire native external-file drop onto `containerRef`'s element. Highlights the
 * hovered folder row (or the whole list, for a drop into the current scope) and
 * calls `onDrop(targetFolder, files)` — `targetFolder` is null when not over a
 * specific folder. Ignores single-zip drags so the window overlay handles those.
 */
export function useExternalFileDrop(
  containerRef: { current: HTMLElement | null },
  enabled: boolean,
  onDrop: (targetFolder: string | null, files: ExternalDropFile[]) => void,
): ExternalFileDrop {
  const [active, setActive] = useState(false);
  const [targetFolder, setTargetFolder] = useState<string | null>(null);
  // Keep the latest onDrop reachable without re-binding the listeners each render.
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) {
      return;
    }
    // dragenter/leave fire as the pointer crosses CHILD elements too; a depth
    // counter keeps `active` from flickering off mid-list.
    let depth = 0;
    const reset = () => {
      depth = 0;
      setActive(false);
      setTargetFolder(null);
    };
    const folderAt = (x: number, y: number): string | null => {
      const hit = document.elementFromPoint(x, y);
      const rowEl = hit?.closest<HTMLElement>('[data-tree-row][data-dir="1"]');
      return rowEl?.dataset.path ?? null;
    };

    const onEnter = (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer) || looksLikeZip(e.dataTransfer)) return;
      e.preventDefault();
      depth += 1;
      setActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer) || looksLikeZip(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setActive(true);
      setTargetFolder(folderAt(e.clientX, e.clientY));
    };
    const onLeave = (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer)) return;
      depth -= 1;
      if (depth <= 0) reset();
    };
    const onDropEvent = (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer)) return;
      // Claim the drop (incl. a zip dropped here — the caller routes a single
      // zip to project-import by filename) so the window fallback doesn't also
      // fire on the same files.
      e.preventDefault();
      e.stopPropagation();
      const folder = folderAt(e.clientX, e.clientY);
      const files = Array.from(e.dataTransfer?.files ?? []).map((f) => ({
        name: f.name,
        getBuffer: () => f.arrayBuffer(),
      }));
      reset();
      if (files.length > 0) onDropRef.current(folder, files);
    };

    // Abandon safety nets (mirroring useTreeDrag's blur/cancel guards): an OS file
    // drag fires no in-page `dragend`, and an ESC-cancel / drop-elsewhere / window
    // blur leaves no balancing `dragleave` — so without these the highlight could
    // stay stuck until the next drag enters. `drop` is capture-phase so a drop
    // anywhere (incl. one a list claims + stops bubbling) still clears it.
    const onAbandon = () => reset();
    el.addEventListener("dragenter", onEnter);
    el.addEventListener("dragover", onOver);
    el.addEventListener("dragleave", onLeave);
    el.addEventListener("drop", onDropEvent);
    window.addEventListener("dragend", onAbandon);
    window.addEventListener("blur", onAbandon);
    window.addEventListener("drop", onAbandon, true);
    return () => {
      el.removeEventListener("dragenter", onEnter);
      el.removeEventListener("dragover", onOver);
      el.removeEventListener("dragleave", onLeave);
      el.removeEventListener("drop", onDropEvent);
      window.removeEventListener("dragend", onAbandon);
      window.removeEventListener("blur", onAbandon);
      window.removeEventListener("drop", onAbandon, true);
    };
  }, [containerRef, enabled]);

  return { active, targetFolder };
}
