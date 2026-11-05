import { useComputed, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { saveStatusOf, type SaveStatus } from "../../workspace/saveStatus";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";

const MINUTE = 60_000;

export default function useSaveStatus(): SaveStatus | null {
  const now = useSignal(Date.now());

  useEffect(() => {
    const tick = window.setInterval(() => {
      now.value = Date.now();
    }, MINUTE);
    return () => window.clearInterval(tick);
  }, []);

  return useComputed(() =>
    saveStatusOf(
      workspace.state.value.sync?.status,
      workspace.state.value.project?.id === WorkspaceConstants.LOCAL_PROJECT_ID,
      workspace.importProgress.value,
      workspace.syncedAt.value,
      now.value,
    ),
  ).value;
}
