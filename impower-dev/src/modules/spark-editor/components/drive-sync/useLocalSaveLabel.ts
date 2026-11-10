import { useComputed } from "@preact/signals";
import { localSaveLabel } from "../../workspace/saveStatus";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";

export default function useLocalSaveLabel(): string {
  return useComputed(() =>
    localSaveLabel(
      workspace.state.value.sync?.status,
      workspace.state.value.project?.id === WorkspaceConstants.LOCAL_PROJECT_ID,
    ),
  ).value;
}
