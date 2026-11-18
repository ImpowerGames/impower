import {
  Button,
  CloseIcon,
  Dialog,
  DialogTitle,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useMemo, useRef } from "preact/hooks";
import {
  playedRows,
  problemRows,
  problemSummary,
  scopeContext,
  scopedProblems,
  type ProblemsScope,
  type Problem,
} from "../../workspace/problems/problemEntries";
import problems from "../../workspace/problems/ProblemsStore";
import { useDebugRows } from "./debugCards";
import {
  PANEL_LABEL,
  PanelItemView,
  panelItemKey,
  type PanelItem,
} from "./ProblemsPanel";

export const BROWSE_SCRIPTS_SELECTOR = "[data-browse-scripts]";

const PROBLEMS_TITLE = "Problems to fix";

const LEAVE_FOCUS =
  typeof document === "undefined" ? null : document.createElement("span");

function DialogRows({
  scope,
  listed,
}: {
  scope: ProblemsScope;
  listed: readonly Problem[];
}) {
  const all = useComputed(() => problems.problems.value).value;
  const played = useComputed(() => problems.played.value).value;
  const shown = useComputed(() => problems.shown.value).value;
  const cards = useComputed(() => problems.cards.value).value;
  const story = scope.kind === "story";
  const debugRows = useDebugRows(cards);
  const headings = new Set(listed.map((problem) => problem.path)).size > 1;
  const rows = useMemo<PanelItem[]>(
    () => [
      ...problemRows(listed, { headings, card: false }),
      ...(story
        ? [
            ...playedRows({ played, shown, open: cards.played }),
            ...debugRows.map((row) => ({ kind: "debug" as const, row })),
          ]
        : []),
    ],
    [listed, headings, story, played, shown, cards.played, debugRows],
  );
  return (
    <div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pr-gutter-3 pb-3 pl-3 [scrollbar-width:thin]">
      <div role="list" aria-label={story ? PANEL_LABEL : PROBLEMS_TITLE}>
        {rows.map((row) => (
          <div key={panelItemKey(row)} role="listitem">
            <PanelItemView row={row} all={all} played={played} fit="flow" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProblemsDialog() {
  const open = useComputed(() => !!problems.dialog.value).value;
  const last = useRef(problems.dialog.value);
  const state = useComputed(() => problems.dialog.value).value ?? last.current;
  last.current = state;
  const all = useComputed(() => problems.problems.value).value;
  const versions = useComputed(() => problems.versions.value).value;
  const diagnostics = useComputed(() => problems.diagnostics.value).value;
  const listed = useMemo(
    () =>
      state ? scopedProblems(state.scope, all, { diagnostics, versions }) : [],
    [state, all, diagnostics, versions],
  );

  const returnFocus = () => {
    if (problems.takeLeftForScript()) {
      return LEAVE_FOCUS;
    }
    const trigger = state?.returnFocus?.();
    return trigger?.isConnected
      ? trigger
      : document.querySelector<HTMLElement>(BROWSE_SCRIPTS_SELECTOR);
  };

  const summary = problemSummary(listed);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && problems.closeDialog()}
      size="lg"
      responsive
      flush
      returnFocus={returnFocus}
    >
      <div class="flex-none px-5 pt-5">
        <div class="mb-2 flex items-center gap-2">
          <DialogTitle class="flex-1 text-[22px]/[1.25] font-semibold tracking-[-0.02em]">
            {state?.scope.kind === "story" ? PANEL_LABEL : PROBLEMS_TITLE}
          </DialogTitle>
          <Button
            variant="quiet"
            size="icon"
            aria-label="Close dialog"
            title="Close dialog"
            onClick={() => problems.closeDialog()}
          >
            <CloseIcon />
          </Button>
        </div>
        {state ? (
          <p class="m-0 mb-2 text-[14px]/[1.6] text-muted [overflow-wrap:anywhere]">
            {summary
              ? `${scopeContext(state.scope)} · ${summary}`
              : scopeContext(state.scope)}
          </p>
        ) : null}
      </div>
      {state ? <DialogRows scope={state.scope} listed={listed} /> : null}
    </Dialog>
  );
}
