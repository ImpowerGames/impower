import { useEffect, useRef, useState } from "preact/hooks";
import { carriesFiles, droppedFiles, FILE_DROP_HIDE_MS, FILE_DROP_TARGET } from "../../utils/fileDrops";
import type { AddedFile } from "../../workspace/addAssetFiles";
import { DROP_FOLDER } from "../library-page";

const folderAt = (target: EventTarget | null): string | null => {
  const found = target instanceof Element ? target.closest(`[${DROP_FOLDER}]`) : null;
  return found ? found.getAttribute(DROP_FOLDER) : null;
};

export type FileDropOptions = {
  current: () => string;
  onDrop: (files: AddedFile[], folder: string) => void;
};

export function useFileDrop(options: FileDropOptions) {
  const latest = useRef(options);
  latest.current = options;
  const [over, setOver] = useState<{ folder: string; target: string | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const hide = () => {
    clearTimeout(timer.current);
    setOver(null);
  };

  const onFiles = (event: DragEvent) => {
    if (!carriesFiles(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    const target = folderAt(event.target);
    const folder = target ?? latest.current.current();
    setOver((prev) => (prev?.folder === folder && prev.target === target ? prev : { folder, target }));
    clearTimeout(timer.current);
    timer.current = setTimeout(hide, FILE_DROP_HIDE_MS);
  };

  const area = {
    [FILE_DROP_TARGET]: "",
    onDragEnter: onFiles,
    onDragOver: onFiles,
    onDrop: (event: DragEvent) => {
      if (!carriesFiles(event)) {
        return;
      }
      event.preventDefault();
      const folder = folderAt(event.target) ?? latest.current.current();
      hide();
      const files = droppedFiles(event);
      if (files.length) {
        latest.current.onDrop(files, folder);
      }
    },
  };

  return { over, area };
}
