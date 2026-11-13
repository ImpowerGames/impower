import { Button } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useRef } from "preact/hooks";
import { plural } from "../../workspace/problems/problemEntries";
import problems from "../../workspace/problems/ProblemsStore";

export default function StoryProblemCount() {
  const ref = useRef<HTMLButtonElement | null>(null);
  const count = useComputed(() => problems.counts.value).value;

  if (!count.problems) {
    return null;
  }

  return (
    <span class="flex flex-none items-center text-[12px]/[18px] in-data-[layout=phone]:text-[11px]/[1.4]">
      <span aria-hidden="true" class="px-1 text-muted">
        ·
      </span>
      <label class="inline-hit-down h-[18px] in-data-[layout=phone]:h-[1lh]">
        <Button
          ref={ref}
          variant="quiet"
          data-tone={count.errors ? "error" : "warning"}
          title="Show problems"
          class="min-h-0 min-w-0 px-1 py-0 text-[12px]/[18px] font-normal in-data-[layout=phone]:text-[11px]/[1.4] data-[tone=error]:text-error-strong data-[tone=warning]:text-warning-strong"
          onClick={() => problems.showProblems(() => ref.current)}
        >
          {plural(count.problems, "problem")}
        </Button>
      </label>
    </span>
  );
}
