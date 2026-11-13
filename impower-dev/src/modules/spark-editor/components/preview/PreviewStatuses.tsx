import { StatusBadge } from "@impower/impower-ui/components";
import type { PreviewMode } from "../../workspace/settings/settingsSchema";
import statuses, { shownStatuses } from "../../workspace/statuses/StatusesStore";
import workspace from "../../workspace/WorkspaceStore";

export interface PreviewStatusesProps {
  mode: PreviewMode;
}

export default function PreviewStatuses({ mode }: PreviewStatusesProps) {
  const starting = !!workspace.state.value.preview?.modes?.game?.starting;
  const shown = shownStatuses(statuses.statuses.value, mode, starting);
  if (shown.length === 0) {
    return null;
  }
  return (
    <div
      data-preview-statuses
      class="pointer-events-none absolute top-3 left-3 z-[3] flex max-w-[calc(100%-24px)] flex-col items-start gap-2"
    >
      {shown.map((status) => (
        <StatusBadge
          key={status.key}
          tone={status.tone}
          data-status={status.key}
        >
          {status.text}
        </StatusBadge>
      ))}
    </div>
  );
}
