import {
  Button,
  CloseIcon,
  Dialog,
  DialogTitle,
  FixMenu,
  MessageEntry,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useRef } from "preact/hooks";
import {
  fixChoiceOf,
  groupByScript,
  lineLink,
  problemSummary,
  SCRIPT_PREFIX,
  scopeContext,
  scopedProblems,
  type DiagnosticFixAction,
  type Problem,
} from "../../workspace/problems/problemEntries";
import problems from "../../workspace/problems/ProblemsStore";
import { DebugCardsList } from "./debugCards";
import { keepFocusAfterFix, problemSignature } from "./fixFocus";

export const BROWSE_SCRIPTS_SELECTOR = "[data-browse-scripts]";

const CLOSE_DIALOG = '[aria-label="Close dialog"]';

const LEAVE_FOCUS =
  typeof document === "undefined" ? null : document.createElement("span");

export default function ProblemsDialog() {
  const open = useComputed(() => !!problems.dialog.value).value;
  const last = useRef(problems.dialog.value);
  const state = useComputed(() => problems.dialog.value).value ?? last.current;
  last.current = state;
  const all = useComputed(() => problems.problems.value).value;
  const versions = useComputed(() => problems.versions.value).value;
  const diagnostics = useComputed(() => problems.diagnostics.value).value;
  const listed = state
    ? scopedProblems(state.scope, all, { diagnostics, versions })
    : [];
  const list = useRef<HTMLDivElement>(null);

  const returnFocus = () => {
    if (problems.takeLeftForScript()) {
      return LEAVE_FOCUS;
    }
    const trigger = state?.returnFocus?.();
    return trigger?.isConnected
      ? trigger
      : document.querySelector<HTMLElement>(BROWSE_SCRIPTS_SELECTOR);
  };

  const chooseFix = (problem: Problem, action: DiagnosticFixAction) => {
    const root = list.current;
    if (root) {
      keepFocusAfterFix(
        root,
        problem,
        () =>
          root
            .closest('[role="dialog"]')
            ?.querySelector<HTMLElement>(CLOSE_DIALOG) ?? null,
      );
    }
    void problems.applyFix(fixChoiceOf(problem, action));
  };

  const groups = groupByScript(listed);
  const headings = groups.length > 1;
  const summary = problemSummary(listed);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && problems.closeDialog()}
      size="lg"
      responsive
      returnFocus={returnFocus}
    >
      <div class="mb-2 flex items-center gap-2">
        <DialogTitle class="flex-1 text-[22px]/[1.25] font-semibold tracking-[-0.02em]">
          Problems to fix
        </DialogTitle>
        <Button
          variant="quiet"
          size="icon"
          aria-label="Close dialog"
          title="Close dialog"
          class="text-muted"
          onClick={() => problems.closeDialog()}
        >
          <CloseIcon />
        </Button>
      </div>
      {state ? (
        <p class="m-0 mb-2 text-[14px]/[1.6] text-ink [overflow-wrap:anywhere]">
          {summary
            ? `${scopeContext(state.scope)} · ${summary}`
            : scopeContext(state.scope)}
        </p>
      ) : null}
      <div
        ref={list}
        class={
          state?.scope.kind === "story"
            ? "-mx-2 max-h-[20vh] overflow-y-auto overscroll-contain [scrollbar-width:thin]"
            : "-mx-2 max-h-[60vh] overflow-y-auto overscroll-contain [scrollbar-width:thin]"
        }
      >
        {groups.map((group) => (
          <div key={group.path} class="pt-1 pb-0.5">
            {headings ? (
              <h3 class="m-0 mx-2 mt-2 mb-1 flex items-baseline gap-2 text-[12px]/[1.4] font-semibold text-ink">
                <span class="flex-none">{group.entries[0]!.script}</span>
                <small class="min-w-0 flex-1 text-[11px] font-normal text-muted [--fade:24px] fade-edge">
                  {group.path}
                </small>
              </h3>
            ) : null}
            {group.entries.map((problem) => (
              <div
                key={problem.key}
                data-problem-entry={problemSignature(problem)}
                data-problem-key={problem.key}
                class="contents"
              >
                <MessageEntry
                  severity={problem.severity}
                  prefix={SCRIPT_PREFIX[problem.severity]}
                  title={problem.title}
                  message={problem.message}
                  location={lineLink(problem.line)}
                  locationLabel={`Open ${problem.script} at line ${problem.line}`}
                  onJump={() => {
                    void problems.jump({
                      uri: problem.uri,
                      line: problem.line,
                      character: problem.range.start.character,
                    });
                  }}
                  actions={
                    problem.actions.length ? (
                      <FixMenu
                        actions={problem.actions}
                        onChoose={(action) => chooseFix(problem, action)}
                      />
                    ) : undefined
                  }
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      {state?.scope.kind === "story" ? <DebugCardsList /> : null}
    </Dialog>
  );
}
