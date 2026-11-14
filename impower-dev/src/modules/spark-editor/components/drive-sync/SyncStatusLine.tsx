import { ErrorIcon, WarningIcon } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { saveStatusOf, type SaveAction } from "../../workspace/saveStatus";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";
import LocalStorageStatus from "./LocalStorageStatus";
import useSaveStatus from "./useSaveStatus";

const ACTION_TITLE: Record<SaveAction, string> = {
  menu: "Open the app menu",
  settings: "Open Save & sync",
  conflict: "Resolve the sync conflict",
};

const SETTLED_TEXT = saveStatusOf("cached", true)?.text;

const STATUS_BUTTON =
  "inline-flex cursor-pointer items-center gap-1 rounded-sm px-0 text-[12px]/[18px] text-muted outline-none in-data-[layout=phone]:text-[11px]/[1.4] hover:underline focus-visible:underline data-[tone=saved]:text-success data-[tone=pending]:text-primary data-[tone=warning]:text-warning data-[tone=error]:text-danger [&_svg]:size-3.5";

const runAction = async (action: SaveAction) => {
  const { Workspace } = await import("../../workspace/Workspace");
  if (action === "conflict") {
    Workspace.window.openSyncConflict();
  } else if (action === "settings") {
    Workspace.window.navigateTo("project", "save-settings");
  } else {
    Workspace.window.setAppMenuOpen(true);
  }
};

export default function SyncStatusLine() {
  const status = useSaveStatus();
  const local = useComputed(
    () =>
      workspace.signals.projectId.value === WorkspaceConstants.LOCAL_PROJECT_ID,
  ).value;

  if (!status) {
    return (
      <span class="skeleton-sheen block h-[18px] w-20 in-data-[layout=phone]:h-[15.4px] rounded-full text-transparent">
        {SETTLED_TEXT}
      </span>
    );
  }

  return (
    <div role="status" aria-live="polite" class="flex h-[18px] in-data-[layout=phone]:h-auto">
      <label class="inline-hit-down h-full">
        {local && status.action === "menu" ? (
          <LocalStorageStatus status={status} buttonClass={STATUS_BUTTON} />
        ) : (
          <button
            type="button"
            data-tone={status.tone}
            data-action={status.action}
            class={STATUS_BUTTON}
            title={ACTION_TITLE[status.action]}
            onClick={() => void runAction(status.action)}
          >
            {status.glyph === "error" ? (
              <ErrorIcon />
            ) : status.glyph === "warning" ? (
              <WarningIcon />
            ) : null}
            {status.text}
          </button>
        )}
      </label>
    </div>
  );
}
