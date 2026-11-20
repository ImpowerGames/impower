import { cn, StatusBadge, statusBadgeVariants } from "@impower/impower-ui/components";
import problems from "../../workspace/problems/ProblemsStore";
import {
  playRefusalLink,
  playRefusalTarget,
  playRefusalText,
} from "../../workspace/playRefusal";
import type { PreviewMode } from "../../workspace/settings/settingsSchema";
import statuses, { shownStatuses } from "../../workspace/statuses/StatusesStore";
import workspace from "../../workspace/WorkspaceStore";
import PreviewDebugToolbar, {
  isStopped,
} from "../preview-debug-toolbar/PreviewDebugToolbar";

export interface PreviewStatusesProps {
  mode: PreviewMode;
}

const revealPlayRefusal = async () => {
  const { Workspace } = await import("../../workspace/Workspace");
  await Workspace.window.revealPlayRefusal();
};

export default function PreviewStatuses({ mode }: PreviewStatusesProps) {
  const game = workspace.state.value.preview?.modes?.game;
  const starting = !!game?.starting;
  const live = !!game?.running || starting;
  const refusal = live ? undefined : game?.playRefusal;
  const shown = shownStatuses(statuses.statuses.value, mode, starting);
  const stopped = isStopped(game);
  if (shown.length === 0 && !refusal && !stopped) {
    return null;
  }
  return (
    <div
      data-preview-statuses
      class="pointer-events-none absolute top-3 left-3 z-[3] flex max-w-[calc(100%-24px)] flex-col items-start gap-2"
    >
      {stopped ? <PreviewDebugToolbar /> : null}
      {refusal ? (
        <button
          type="button"
          data-status="refusal"
          onClick={() => void revealPlayRefusal()}
          class={cn(
            statusBadgeVariants({ tone: "error" }),
            "pointer-events-auto cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-accent",
          )}
        >
          <span>{playRefusalText(refusal)}.</span>{" "}
          <span class="whitespace-nowrap underline underline-offset-2">
            {playRefusalLink(playRefusalTarget(problems.problems.value, refusal))}
          </span>
        </button>
      ) : null}
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
