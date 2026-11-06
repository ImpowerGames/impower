import { onProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidChangeDirectoriesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeDirectoriesMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { useComputed } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";

export interface ProjectFile {
  readonly path: string;
  readonly type: string;
  readonly src: string;
}

export function useProjectFiles(): readonly ProjectFile[] {
  const projectId = useComputed(() => workspace.signals.projectId.value).value;
  const [files, setFiles] = useState<readonly ProjectFile[]>([]);

  useEffect(() => {
    if (!projectId) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const { Workspace } = await import("../../workspace/Workspace");
        const all = await Workspace.fs.getFiles(projectId);
        if (!cancelled) {
          setFiles(
            Object.values(all).map((file) => ({
              path: Workspace.fs.getRelativePath(projectId, file.uri),
              type: file.type,
              src: file.src,
            })),
          );
        }
      } catch {
        if (!cancelled) {
          setFiles([]);
        }
      }
    };
    void load();
    const detachFiles = onProtocolMessage(DidChangeWatchedFilesMessage.type, () => void load());
    const detachDirectories = onProtocolMessage(DidChangeDirectoriesMessage.type, () => void load());
    return () => {
      cancelled = true;
      detachFiles();
      detachDirectories();
    };
  }, [projectId]);

  return files;
}
