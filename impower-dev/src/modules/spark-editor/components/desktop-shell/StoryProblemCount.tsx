import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";
import { countProblems } from "../../workspace/problemCounts";

export default function StoryProblemCount() {
  const count = useComputed(() =>
    countProblems(workspace.state.value.debug?.diagnosticsSummary),
  ).value;

  if (!count.problems) {
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
      {count.problems} {count.problems === 1 ? "problem" : "problems"}
    </span>
  );
}
