import { useComputed } from "@preact/signals";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import { saveStatusOf } from "../../workspace/saveStatus";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type HeaderTitleCaptionProps = Partial<typeof propDefaults>;

export default function HeaderTitleCaption(_p: HeaderTitleCaptionProps) {
  const name = useComputed(
    () => workspace.state.value.project?.name || "",
  ).value;
  const status = useComputed(() =>
    saveStatusOf(
      workspace.state.value.sync?.status,
      workspace.state.value.project?.id === WorkspaceConstants.LOCAL_PROJECT_ID,
      workspace.importProgress.value,
    ),
  ).value;

  const showSkeleton = !name || !status;

  return (
    <div
      role="status"
      aria-live="polite"
      data-tone={status?.tone}
      class="-mt-0.5 mb-0.5 flex flex-row items-center text-sm font-medium select-none text-foreground/60 data-[tone=pending]:text-primary data-[tone=warning]:text-warning-strong data-[tone=error]:text-error-strong"
    >
      {showSkeleton ? (
        <span class="skeleton-sheen rounded-full text-transparent">
          Draft saved
        </span>
      ) : (
        status.text
      )}
    </div>
  );
}
