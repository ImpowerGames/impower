import { Button, ChevronDownIcon } from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import { useComputed } from "@preact/signals";
import { useRef } from "preact/hooks";
import { problemsLabel } from "../../workspace/problemCounts";
import { previewInStrip } from "../../workspace/previewInStrip";
import problems from "../../workspace/problems/ProblemsStore";
import { PROBLEMS_PANEL_ID } from "./ProblemsPanel";

export default function ProblemsToggle() {
  const stripped = previewInStrip(useLayout());
  const ref = useRef<HTMLButtonElement | null>(null);
  const counts = useComputed(() => problems.counts.value).value;
  const open = useComputed(() => problems.problemsShown.value).value;
  const label = problemsLabel(counts);
  const expanded = !stripped && open;

  return (
    <>
      <Button
        ref={ref}
        variant="quiet"
        title={stripped ? "Show problems" : `${expanded ? "Collapse" : "Open"} the panel`}
        aria-expanded={stripped ? undefined : expanded}
        aria-controls={stripped ? undefined : PROBLEMS_PANEL_ID}
        aria-haspopup={stripped ? "dialog" : undefined}
        data-problems={counts.problems > 0 ? "" : undefined}
        class="gap-1.5 pr-2.5 pl-[7px] text-[12px]/[1.6] font-semibold text-muted data-problems:text-ink aria-expanded:[&>svg]:rotate-0"
        onClick={() => problems.togglePanel(() => ref.current)}
      >
        <ChevronDownIcon class="size-4! -rotate-90 text-muted" />
        <span>{label}</span>
      </Button>
      <span role="status" aria-live="polite" aria-atomic="true" class="sr-only">
        {label}
      </span>
    </>
  );
}
