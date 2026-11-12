import type { WorkspaceEditAction } from "../../protocols/workspace/ApplyWorkspaceEditMessage";

export interface TrashEntry {
  relPath: string;
  originalUri: string;
  type: string;
}

export interface TrashReason {
  kind: "failed-edit";
  action?: WorkspaceEditAction;
}

export interface TrashBatch {
  batchId: string;
  deletedAt: number;
  entries: TrashEntry[];
  folders?: string[];
  reason?: TrashReason;
}
