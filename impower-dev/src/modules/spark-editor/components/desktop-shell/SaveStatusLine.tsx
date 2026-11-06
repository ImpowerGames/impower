import { useComputed } from "@preact/signals";
import { saveStatusOf } from "../../workspace/saveStatus";
import { WorkspaceConstants } from "../../workspace/WorkspaceConstants";
import workspace from "../../workspace/WorkspaceStore";
import { problemCountOf } from "./problemCount";

function ProblemCount() {
  const count = useComputed(() =>
    problemCountOf(workspace.state.value.debug?.diagnosticsSummary),
  ).value;

  if (!count.total) {
    return null;
  }

  return (
    <span
      data-tone={count.errors ? "error" : "warning"}
      class="text-[12px]/[18px] in-data-[layout=phone]:text-[11px]/[1.4] data-[tone=error]:text-error-strong data-[tone=warning]:text-warning-strong"
    >
      <span aria-hidden="true" class="px-1 text-muted">
        ·
      </span>
      {count.total} {count.total === 1 ? "problem" : "problems"}
    </span>
  );
}

export default function SaveStatusLine({ problems }: { problems: boolean }) {
  const status = useComputed(() =>
    saveStatusOf(
      workspace.state.value.sync?.status,
      workspace.state.value.project?.id === WorkspaceConstants.LOCAL_PROJECT_ID,
      workspace.importProgress.value,
    ),
  ).value;

  const openAppMenu = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.setAppMenuOpen(true);
  };

  if (!status) {
    return (
      <span class="skeleton-sheen block h-[18px] w-20 rounded-full text-transparent">
        Draft saved
      </span>
    );
  }

  return (
    <div role="status" aria-live="polite" class="flex h-[18px] items-center">
      <button
        type="button"
        data-tone={status.tone}
        class="cursor-pointer rounded-sm px-0 text-[12px]/[18px] text-muted outline-none hover:underline focus-visible:underline in-data-[layout=phone]:text-[11px]/[1.4] data-[tone=saved]:text-success data-[tone=pending]:text-primary data-[tone=warning]:text-warning-strong data-[tone=error]:text-error-strong"
        title="Open the app menu"
        onClick={openAppMenu}
      >
        {status.text}
      </button>
      {problems && <ProblemCount />}
    </div>
  );
}
