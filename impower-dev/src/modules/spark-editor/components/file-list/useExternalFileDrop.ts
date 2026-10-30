import { useEffect, useRef, useState } from "preact/hooks";

export interface ExternalDropFile {
  name: string;
  getBuffer: () => Promise<ArrayBuffer>;
}

export interface ExternalFileDrop {
  active: boolean;
  targetFolder: string | null;
}

const carriesFiles = (dt: DataTransfer | null) =>
  !!dt && Array.from(dt.types).includes("Files");

const looksLikeZip = (dt: DataTransfer | null) => {
  if (!dt) return false;
  const items = Array.from(dt.items).filter((i) => i.kind === "file");
  return items.length === 1 && /zip/i.test(items[0]!.type);
};

export function useExternalFileDrop(
  containerRef: { current: HTMLElement | null },
  enabled: boolean,
  onDrop: (targetFolder: string | null, files: ExternalDropFile[]) => void,
): ExternalFileDrop {
  const [active, setActive] = useState(false);
  const [targetFolder, setTargetFolder] = useState<string | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) {
      return;
    }
    let depth = 0;
    const reset = () => {
      depth = 0;
      setActive(false);
      setTargetFolder(null);
    };
    const folderAt = (x: number, y: number): string | null => {
      const hit = document.elementFromPoint(x, y);
      const rowEl = hit?.closest<HTMLElement>('[data-tree-row][data-dir="1"]');
      return rowEl?.dataset["path"] ?? null;
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

    // workaround(chromium): an OS file drag fires no in-page dragend and a cancelled or blurred drag no balancing dragleave, so the highlight could stick
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
